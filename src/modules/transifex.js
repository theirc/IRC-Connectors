const crypto = require("crypto");
const Promise = require("bluebird");
const _ = require("lodash");
const request = require("request");
const cheerio = require("cheerio");
const contentful = require("contentful-management");
const { cleanUpHTML } = require("./utils");
const { transifexToSpaceDictionary, contenfulLanguageDictionary } = require("../config");
const toMarkdown = require("to-markdown");
const contentfulManagement = require("contentful-management");

const TRANSIFEX_API_KEY = process.env.TRANSIFEX_API_KEY;
const CONTENTFUL_API_TOKEN = process.env.CONTENTFUL_API_TOKEN;

const client = contentfulManagement.createClient({
	accessToken: CONTENTFUL_API_TOKEN,
});

function resourceTranslationRequest(project, key, l) {
	return new Promise((resolve, reject) => {
		request
			.get(`https://www.transifex.com/api/2/project/${project}/resource/${key}/translation/${l}/`, (e, r, b) => {
				if (e) {
					reject(e);
					return;
				}
				try {
					resolve(JSON.parse(b));
				} catch (e) {
					//reject(e);
					resolve(null);
				}
			})
			.auth("api", TRANSIFEX_API_KEY, false);
	});
}

function transformIncomingText(content) {
	let $ = cheerio.load(content);
	let links = $("a");

	links.each((i, l) => {
		let element = $(l);
		let parentElement = element.parent();

		let href = element.attr("href");

		if (!cleanUpHTML(element.html()).replace(/&nbsp;/gi, "")) {
			element.remove();

			if (parentElement.get(0).tagName === "u" && parentElement.children().length === 1) {
				parentElement.remove();
			}
			return;
		}
	});

	const title = $(".title").remove();
	const subtitle = $(".subtitle").remove();
	const hero = $("img", subtitle).remove();

	const parsedContent = toMarkdown($.html());

	return {
		title: title.text() ? title.text() : null,
		lead: subtitle.html() ? toMarkdown(subtitle.html() || "") : null,
		content: parsedContent,
	};
}

function updateContentful(spaceId, slug, language, payload, contentType) {
	return client
		.getSpace(spaceId)
		.then(s =>
			s
				.getEntries({
					"fields.slug": slug,
					content_type: contentType,
				})
				.then(es => es.total > 0 && s.getEntry(es.items[0].sys.id))
				.then(e => ({
					entry: e,
					space: s,
				}))
		)
		.then(({ entry, space }) => {
			if (entry) {
				const contentfulLanguage = contenfulLanguageDictionary[language];
				Object.keys(payload).forEach(k => {
					let field = entry.fields[k] || { [contentfulLanguage]: "" };

					field[contentfulLanguage] = payload[k];
				});

				// Save and pubish
				return entry.update(); //.then(e => e.publish());
			}
		});
}

module.exports = function(req, res) {
	const { project, resource, event, language, reviewed } = req.body;

	const sign_v2 = (url, date, data, secret) => {
		const content_md5 = md5(data);
		const msg = ["POST", url, date, content_md5].join("\n");
		const hmac = crypto.createHmac("sha256", secret);
		return hmac
			.update(msg)
			.digest()
			.toString("base64");
	};

	switch (event) {
		case "review_completed":
		case "translation_completed":
			resourceTranslationRequest(project, resource, language).then(t => {
				let spaceId = transifexToSpaceDictionary[project];
				let slug = resource.replace(/html$/, "");
				console.log(slug);
				if (slug === "category-names") {
					let payload = JSON.parse(t.content);
					Promise.all(
						Object.keys(payload)
							.filter(k => k.indexOf("---description") === -1)
							.map(k => {
								console.log(k);
								let updatePayload = {
									name: payload[k],
									description: payload[k + "---description"],
								};

								return client
									.getSpace(spaceId)
									.then(s =>
										s
											.getEntries({ "fields.slug": k, content_type: "category" })
											.then(es => es.total > 0 && s.getEntry(es.items[0].sys.id))
											.then(e => ({
												entry: e,
												space: s,
											}))
									)
									.then(({ entry, space }) => {
										if (entry) {
											const contentfulLanguage = contenfulLanguageDictionary[language];
											Object.keys(updatePayload).forEach(uk => {
												let field = entry.fields[uk] || { [contentfulLanguage]: "" };

												field[contentfulLanguage] = updatePayload[uk];
											});

											// Save and pubish
											return entry.update(); //.then(e => e.publish());
										}
									});
							})
					).then(() => console.log("Success"));
				} else {
					let payload = transformIncomingText(t.content);
					let contentType = "article";
					if (slug.indexOf("---") > 0) {
						const slugParts = slug.split("---");

						slug = slugParts[1];
						contentType = slugParts[0];
					}

					updateContentful(spaceId, slug, language, payload, contentType).then(p => {});
				}
			});
			break;

		default:
			break;
	}

	res.sendStatus(200);
};
