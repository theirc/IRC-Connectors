const contentfulManagement = require("contentful-management");
const contentful = require("contentful");
const _ = require("lodash");
const { promiseSerial, reverseMap, cleanUpHTML } = require("./utils");
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

	return $.xml();
}

function importArticleAndVideo(req, space) {
	const { body } = req;
	const spaceId = body.sys.space.sys.id;
	let locale = contentfulPrimaryLanguage[spaceId] ? contenfulLanguageDictionary[contentfulPrimaryLanguage[spaceId]] : "en";
	let project = transifexToSpaceDictionary[spaceId];

	space.getApiKeys().then(k => {
		console.log("Uploading " + body.fields.slug["en-US"] + " to Transifex");
		client = contentful.createClient({
			space: spaceId,
			accessToken: k.items[0].accessToken,
			locale: locale,
		});
		client.getEntries({ "sys.id": body.sys.id, content_type: body.sys.contentType.sys.id }).then(e => {
			const item = _.first(e.items);
			let content = generateContentForTransifex(item);
			let { slug, title } = item.fields;

			if (item.sys.contentType.sys.id === "video") {
				slug = "video---" + slug;
			}

			let payload = {
				slug,
				content: cleanUpHTML(content),
				name: title,
				i18n_type: "XHTML",
				accept_translations: "true",
			};

			let promise = new Promise((resolve, reject) => {
				request
					.get(`https://www.transifex.com/api/2/project/${project}/resource/${slug}/`, (__e, r, __b) => {
						let method = r.statusCode === 404 ? "POST" : "PUT";
						let uri =
							r.statusCode === 404 ? `https://www.transifex.com/api/2/project/${project}/resources/` : `https://www.transifex.com/api/2/project/${project}/resource/${slug}/content/`;

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
									reject(e1);
								}
								let updatePayload = {
									slug: payload.slug,
									name: payload.name,
									categories: item.fields.country && item.fields.country.fields && item.fields.country.fields.slug ? [item.fields.country.fields.slug] : null,
								};

								request(
									{
										method: "PUT",
										uri: `https://www.transifex.com/api/2/project/${project}/resource/${slug}/`,
										auth: {
											user: "api",
											pass: TRANSIFEX_API_KEY,
											sendImmediately: true,
										},
										headers: {
											ContentType: "application/json",
										},
										json: true,
										body: updatePayload,
									},
									(e, r, b) => {
										if (e) {
											reject(e);
										}
										resolve(b1);
									}
								);
							}
						);
					})
					.auth("api", TRANSIFEX_API_KEY, false);
			});

			promise
				.then(() => {
					console.log("Success");
				})
				.catch(e => console.log("Error", e));
		});
	});
}

function uploadCategoriesToTransifex(client, spaceId) {
	let locale = contentfulPrimaryLanguage[spaceId] ? contenfulLanguageDictionary[contentfulPrimaryLanguage[spaceId]] : "en";
	let project = transifexToSpaceDictionary[spaceId];
	client.getEntries({ limit: 1e3, content_type: "category", locale: locale }).then(e => {
		let categoryNames = e.items
			.map(category => [category.fields.slug, category.fields.name])
			.concat(e.items.map(category => [category.fields.slug + "---description", category.fields.description]));
		let categoryDictionary = _.fromPairs(categoryNames);
		console.log(categoryDictionary);
		let slug = "category-names";

		let payload = {
			slug,
			content: JSON.stringify(categoryDictionary),
			name: "Category Names And Descriptions",
			i18n_type: "KEYVALUEJSON",
			accept_translations: "true",
		};

		request
			.get(`https://www.transifex.com/api/2/project/${project}/resource/${slug}/`, (__e, r, __b) => {
				let method = r.statusCode === 404 ? "POST" : "PUT";
				let uri = r.statusCode === 404 ? `https://www.transifex.com/api/2/project/${project}/resources/` : `https://www.transifex.com/api/2/project/${project}/resource/${slug}/content/`;
				console.log(r.statusCode, method, uri);
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

						let updatePayload = {
							slug: payload.slug,
							name: payload.name,
						};

						request(
							{
								method: "PUT",
								uri: `https://www.transifex.com/api/2/project/${project}/resource/${slug}/`,
								auth: {
									user: "api",
									pass: TRANSIFEX_API_KEY,
									sendImmediately: true,
								},
								headers: {
									ContentType: "application/json",
								},
								json: true,
								body: updatePayload,
							},
							(e, r, b) => {
								console.log(b);
							}
						);
					}
				);
			})

			.auth("api", TRANSIFEX_API_KEY, false);
	});
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
					case "video":
						/*
						Uploading content to transifex
						*/
						importArticleAndVideo(req, space);
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
									let categories = _.flattenDeep(e.items.filter(c1 => c1 && c1.fields).map(c1 => [c1, Array.from(c1.fields.categories || [])])).filter(_.identity);
									let promises = categories.map(category => () => fixCategory(space, category).then(c => console.log(category.fields.slug)));
									promiseSerial(promises)
										.then(() => uploadCategoriesToTransifex(client, spaceId))
										.then(c => console.log("Complete"));
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
									let country = _.first(e.items);
									let categories = _.flattenDeep(country.fields.categories.filter(c1 => c1 && c1.fields).map(c1 => [c1, Array.from(c1.fields.categories || [])])).filter(_.identity);
									let promises = categories.map(category => () => fixCategory(space, category, country).then(c => console.log(category.fields.slug)));
									promiseSerial(promises)
										.then(() => uploadCategoriesToTransifex(client, spaceId))
										.then(c => console.log("Complete"));
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
