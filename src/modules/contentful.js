const contentfulManagement = require("contentful-management");
const contentful = require("contentful");
const _ = require("lodash");
const { promiseSerial, reverseMap } = require("./utils");
const Remarkable = require("remarkable");
const cheerio = require("cheerio");
const request = require("request");

const md = new Remarkable("full", {
	html: true,
	linkify: true,
	typographer: true,
	breaks: true,
});

const TRANSIFEX_API_KEY = process.env.TRANSIFEX_API_KEY;
const CONTENTFUL_API_TOKEN = process.env.CONTENTFUL_API_TOKEN;
let { transifexToSpaceDictionary, contenfulLanguageDictionary, contentfulPrimaryLanguage } = require("../config");

const mgmtClient = contentfulManagement.createClient({
	accessToken: CONTENTFUL_API_TOKEN,
});
transifexToSpaceDictionary = reverseMap(transifexToSpaceDictionary);
contenfulLanguageDictionary = reverseMap(contenfulLanguageDictionary);

function generateContentForTransifex(article) {
	let { lead, title, content } = article.fields;
	lead = md.render(lead);
	content = md.render(content);

	let body = `<html><body><div class="title">${title}</div><div class="subtitle">${lead}</div>${content}</body></html>`;
	let $ = cheerio.load(body);

	/*
	Placeholder for Rey's Magic
	*/

	return $.html();
}
/**
 *
 *  
 * 
 */
module.exports = function(req, res) {
	switch (req.headers["x-contentful-topic"]) {
		case "ContentManagement.Entry.publish":
			const spaceId = req.body.sys.space.sys.id;
			mgmtClient.getSpace(spaceId).then(space => {
				switch (req.body.sys.contentType.sys.id) {
					case "article":
						/*
					Uploading content to transifex
					*/
						let locale = contentfulPrimaryLanguage[spaceId] ? contenfulLanguageDictionary[contentfulPrimaryLanguage[spaceId]] : "en";
						let project = transifexToSpaceDictionary[spaceId];
						space.getApiKeys().then(k => {
							client = contentful.createClient({
								space: spaceId,
								accessToken: k.items[0].accessToken,
								locale: locale,
							});
							client.getEntry(req.body.sys.id).then(e => {
								let content = generateContentForTransifex(e);
								let { slug, title } = e.fields;
								console.log(e.fields.slug, content.length);

								let payload = {
									slug,
									content,
									name: title,
									i18n_type: "XHTML",
									accept_translations: "true",
								};

								request
									.get(`https://www.transifex.com/api/2/project/${project}/resource/${slug}/`, (__e, r, __b) => {
										let method = r.statusCode === 404 ? "POST" : "PUT";
										let uri =
											r.statusCode === 404
												? `https://www.transifex.com/api/2/project/${project}/resources/`
												: `https://www.transifex.com/api/2/project/${project}/resource/${slug}/content/`;
										request(
											{
												method,
												uri,
												auth: {
													user: "api",
													pass: TRANSIFEX_API_KEY,
													sendImmediately: true,
												},
												headers: {
													ContentType: "application/json",
												},
												json: true,
												body: payload,
											},
											(e1, r1, b1) => {
												if (e1) {
													console.log(e1);
												}
												console.log(b1);
											}
										);
									})
									.auth("api", TRANSIFEX_API_KEY, false);
							});
						});
						break;
					case "category":
						space.getApiKeys().then(k => {
							client = contentful.createClient({
								space: spaceId,
								accessToken: k.items[0].accessToken,
							});
							client
								.getEntries({
									include: 10,
									content_type: "category",
									"fields.slug": req.body.fields.slug["en-US"],
									limit: 1000,
								})
								.then(e => {
									let categories = _.flattenDeep(e.items.map(c1 => [c1, Array.from(c1.fields.categories || [])])).filter(_.identity);
									let promises = categories.map(category => () => fixCategory(space, category).then(c => console.log(category.fields.slug)));
									promiseSerial(promises).then(c => console.log("Complete"));
								});
						});

						break;
					case "country":
						space.getApiKeys().then(k => {
							client = contentful.createClient({
								space: spaceId,
								accessToken: k.items[0].accessToken,
							});
							client
								.getEntries({
									include: 10,
									content_type: "country",
									"fields.slug": req.body.fields.slug["en-US"],
									limit: 1000,
								})
								.then(e => {
									for (let country of e.items) {
										let categories = _.flattenDeep(country.fields.categories.map(c1 => [c1, Array.from(c1.fields.categories || [])])).filter(_.identity);
										let promises = categories.map(category => () => fixCategory(space, category, country).then(c => console.log(category.fields.slug)));
										promiseSerial(promises).then(c => console.log("Complete"));
									}
								});
						});

						break;
					default:
						break;
				}
			});
			break;
		default:
			break;
	}
	res.sendStatus(200);
};

function fixCategory(space, category, country) {
	var articles = (category.fields.articles || []).concat([category.fields.overview]).filter(_.identity);
	let promises = _.sortBy(articles, a => a.sys.updatedAt).map(article => () => {
		const promise = new Promise((res, rej) => {
			console.log(article.sys.updatedAt);
			space.getEntry(article.sys.id).then(cArticle => {
				space
					.getEntry(category.sys.id)
					.then(cCategory => {
						cArticle.fields.category = {
							"en-US": {
								sys: {
									type: "Link",
									linkType: "Entry",
									id: cCategory.sys.id,
								},
							},
						};
					})
					.then(c => {
						if (country) {
							space.getEntry(country.sys.id).then(cCountry => {
								cArticle.fields.country = {
									"en-US": {
										sys: {
											type: "Link",
											linkType: "Entry",
											id: cCountry.sys.id,
										},
									},
								};

								cArticle
									.update()
									.then(cc => cc.publish())
									.then(() => res())
									.catch(c => console.log(c) && rej());
							});
						} else {
							cArticle
								.update()
								.then(cc => cc.publish())
								.then(() => res())
								.catch(c => console.log(c) && rej());
						}
					});
			});
		});

		return promise;
	});

	return promiseSerial(promises);
}
