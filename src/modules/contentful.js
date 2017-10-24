const CONTENTFUL_API_TOKEN = process.env.CONTENTFUL_API_TOKEN;

const contentfulManagement = require("contentful-management");
const contentful = require("contentful");
const _ = require("lodash");
const mgmtClient = contentfulManagement.createClient({
	accessToken: CONTENTFUL_API_TOKEN,
});

module.exports = function(req, res) {
	switch (req.headers["x-contentful-topic"]) {
		case "ContentManagement.Entry.publish":
			const spaceId = req.body.sys.space.sys.id;
			mgmtClient.getSpace(spaceId).then(space => {
				switch (req.body.sys.contentType.sys.id) {
					case "article":
						//console.log(req.body.fields.slug["en-US"]);

						break;
					case "category":
						//console.log(req.body.fields.slug["en-US"]);

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
						console.log(req.body.fields.slug["en-US"]);
						/* */
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

const promiseSerial = funcs => funcs.reduce((promise, func) => promise.then(result => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]));

function fixCategory(space, category, country) {
	let promises = _.sortBy(category.fields.articles || [], a => a.sys.updatedAt).map(article => () => {
		const promise = new Promise((res, rej) => {
			console.log(article.sys.updatedAt);
			space.getEntry(article.sys.id).then(cArticle => {
				Promise.all([
					space.getEntry(category.sys.id).then(cCategory => {
						cArticle.fields.category = {
							"en-US": {
								sys: {
									type: "Link",
									linkType: "Entry",
									id: cCategory.sys.id,
								},
							},
						};
					}),
					!country ||
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
						}),
				]).then(c => {
					cArticle
						.update()
						.then(cc => cc.publish())
						.then(() => res())
						.catch(c => console.log(c) && rej());
				});
			});
		});

		return promise;
	});

	return promiseSerial(promises);
}
