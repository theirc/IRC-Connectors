const contentfulManagement = require("contentful-management");
const contentful = require("contentful");
const _ = require("lodash");
const {
    promiseSerial,
    reverseMap,
    cleanUpHTML
} = require("./utils");
const Remarkable = require("remarkable");
const cheerio = require("cheerio");
const request = require("request");

const md = new Remarkable("full", {
    html: true,
    linkify: true,
    typographer: false,
    breaks: true,
});

const TRANSIFEX_API_KEY = process.env.TRANSIFEX_API_KEY;
const CONTENTFUL_API_TOKEN = process.env.CONTENTFUL_API_TOKEN;
const TRANSIFEX_API_URL = "https://www.transifex.com/api/2/project";
let {
    transifexToSpaceDictionary,
    contenfulLanguageDictionary,
    contentfulPrimaryLanguage
} = require("../config");

const mgmtClient = contentfulManagement.createClient({
    accessToken: CONTENTFUL_API_TOKEN,
});
transifexToSpaceDictionary = reverseMap(transifexToSpaceDictionary);
contenfulLanguageDictionary = reverseMap(contenfulLanguageDictionary);

function generateContentForTransifex(article) {
    let {
        lead,
        title,
        content
    } = article.fields;
    lead = cleanUpHTML(md.render(lead));
    content = cleanUpHTML(md.render(content));

    let body = `<html><body><div class="title">${title}</div><div class="subtitle">${lead}</div>${content}</body></html>`;

    return body;
}

function unicodeEscape(str) {
    return str.replace(/[\s\S]/g, function (character) {
        var escape = character.charCodeAt().toString(16),
            longhand = escape.length > 2;
        if (!longhand) {
            return character;
        }
        return '&#' + ('x') + ('0000' + escape).slice(longhand ? -4 : -2) + ';';
    });
}


function importArticleAndVideo(req, space) {
    const {
        body
    } = req;
    const spaceId = body.sys.space.sys.id;
    let locale = contentfulPrimaryLanguage[spaceId] ? contenfulLanguageDictionary[contentfulPrimaryLanguage[spaceId]] : "en";
    let project = transifexToSpaceDictionary[spaceId];

    // space.getApiKeys().then(k => {
    //     console.log("Uploading " + body.fields.slug["en-US"] + " to Transifex");
    var accessToken = process.env.CONTENTFUL_CONTENT_TOKEN;// || k.items[0].accessToken
    var host = process.env.CONTENTFUL_CONTENT_HOST;
    client = contentful.createClient({
        space: spaceId,
        accessToken: accessToken,
        host: host,
        locale: locale,
    });
    client.getEntries({
        "sys.id": body.sys.id,
        content_type: body.sys.contentType.sys.id
    }).then(e => {
        const item = _.first(e.items);
        let content = generateContentForTransifex(item);
        let {
            slug,
            title
        } = item.fields;

        if (item.sys.contentType.sys.id === "video") {
            slug = "video---" + slug;
        }

        let payload = {
            slug,
            // content: unicodeEscape(content),
            content: content,
            name: title,
            i18n_type: "XHTML",
            accept_translations: "true",
        };

        let promise = new Promise((resolve, reject) => {
            request
                .get(`${TRANSIFEX_API_URL}/${project}/resource/${slug}/`, (__e, r, __b) => {
                    let method = r.statusCode === 404 ? "POST" : "PUT";
                    let uri =
                        r.statusCode === 404 ? `${TRANSIFEX_API_URL}/${project}/resources/` : `${TRANSIFEX_API_URL}/${project}/resource/${slug}/content/`;

                    request({
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
                            if (r1.statusCode > 201) {
																console.log('Error', payload);
																console.log(item, content);
                                request({
                                    method: 'post',
                                    uri: 'https://hooks.slack.com/services/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',
                                    headers: {
                                        ContentType: "application/json",
                                    },
                                    json: true,
                                    body: {
                                        text: `*TRANSIFEX UPLOAD ERROR*\nArticle with slug ${payload.slug}, failed to upload to transifex.\nResponse from transifex servers: ${b1}.`,
                                        attachments: [{
                                            title: 'What went to transifex',
                                            text: JSON.stringify(payload)
                                        }]
                                    }
                                }, () => {
                                    console.log('Hooked')
                                })

                                reject(e);
                                return;
                            }
                            let updatePayload = {
                                slug: payload.slug,
                                name: payload.name,
                                categories: item.fields.country && item.fields.country.fields && item.fields.country.fields.slug ? [item.fields.country.fields.slug] : null,
                            };


                            request({
                                method: "PUT",
                                uri: `${TRANSIFEX_API_URL}/${project}/resource/${slug}/`,
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

                                    if (r.statusCode > 201) {
                                        console.log('Error', payload.slug);
                                        request({
                                            method: 'post',
                                            headers: {
                                                ContentType: "application/json",
                                            },
                                            json: true,
                                            uri: 'https://hooks.slack.com/services/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',
                                            body: {
                                                text: `*TRANSIFEX UPLOAD ERROR*\nArticle with slug ${payload.slug}, failed to upload to transifex.\nResponse from transifex servers: ${b1}.`,
                                                attachments: [{
                                                    title: 'What went to transifex',
                                                    text: JSON.stringify(payload)
                                                }]
                                            }
                                        }, () => {
                                            console.log('Hooked')
                                        })

                                        reject(e);
                                        return;
                                    } else {
                                        request({
                                            method: 'post',
                                            headers: {
                                                ContentType: "application/json",
                                            },
                                            json: true,
                                            uri: 'https://hooks.slack.com/services/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',
                                            body: {
                                                text: `Hi! I just uploaded ${payload.slug} successfully to transifex.`
                                            }
                                        }, () => {
                                            console.log('Success Hooked')
                                        })
                                    }
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
    }).catch(error => {
    	console.error(error);
    });
}

function importCategory(req, space) {
    // space.getApiKeys().then(k => {
    const spaceId = req.body.sys.space.sys.id;
    var accessToken = process.env.CONTENTFUL_CONTENT_TOKEN;// || k.items[0].accessToken
    var host = process.env.CONTENTFUL_CONTENT_HOST;
    client = contentful.createClient({
        space: spaceId,
        accessToken: accessToken,
        host: host,
    });
    client.getEntries({
        include: 10,
        content_type: "category",
        "fields.slug": req.body.fields.slug["en-US"],
        limit: 1000,
    })
        .then(e => {
            let categories = _.flattenDeep(e.items.filter(c1 => c1 && c1.fields).map(c1 => [c1, Array.from(c1.fields.categories || [])])).filter(_.identity);
            console.log(_.uniq(categories.map(c => c.fields.searchable)));
            categories = categories.filter(c => !!c.fields.searchable);
            console.log("Not updating categories", categories.filter(c => !!!c.fields.searchable).map(a => a.fields));

            let promises = categories.map(category => () => fixCategory(space, category).then(c => console.log(category.fields.slug)));
            promiseSerial(promises)
                .then(() => uploadCategoriesToTransifex(client, spaceId))
                .then(c => console.log("Complete"));
        });
    // });
}
function importCountry(req, space) {
    // space.getApiKeys().then(k => {
    var accessToken = process.env.CONTENTFUL_CONTENT_TOKEN;// || k.items[0].accessToken
    var host = process.env.CONTENTFUL_CONTENT_HOST;
    client = contentful.createClient({
        space: spaceId,
        accessToken: accessToken,
        host: host,
    });
    client.getEntries({
        include: 10,
        content_type: "country",
        "fields.slug": req.body.fields.slug["en-US"],
        limit: 1000,
    })
        .then(e => {
            let country = _.first(e.items);
            let categories = _.flattenDeep(country.fields.categories.filter(c1 => c1 && c1.fields).map(c1 => [c1, Array.from(c1.fields.categories || [])])).filter(_.identity);
            console.log(_.uniq(categories.map(c => c.fields.searchable)));
            categories = categories.filter(c => !!c.fields.searchable);
            console.log("Not updating categories", categories.filter(c => !!!c.fields.searchable).map(a => a.fields));

            let promises = categories.map(category => () => fixCategory(space, category, country).then(c => console.log(category.fields.slug)));
            promiseSerial(promises)
                .then(() => uploadCategoriesToTransifex(client, spaceId))
                .then(c => console.log("Complete"));
        });
    // });

}
function uploadCategoriesToTransifex(client, spaceId) {
    let locale = contentfulPrimaryLanguage[spaceId] ? contenfulLanguageDictionary[contentfulPrimaryLanguage[spaceId]] : "en";
    let project = transifexToSpaceDictionary[spaceId];
    client.getEntries({
        limit: 1e3,
        content_type: "category",
        // locale: locale
    }).then(e => {
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
            .get(`${TRANSIFEX_API_URL}/${project}/resource/${slug}/`, (__e, r, __b) => {
                let method = r.statusCode === 404 ? "POST" : "PUT";
                let uri = r.statusCode === 404 ? `${TRANSIFEX_API_URL}/${project}/resources/` : `${TRANSIFEX_API_URL}/${project}/resource/${slug}/content/`;
                console.log(r.statusCode, method, uri);
                request({
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

                        request({
                            method: "PUT",
                            uri: `${TRANSIFEX_API_URL}/${project}/resource/${slug}/`,
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
module.exports = function (req, res) {
    switch (req.headers["x-contentful-topic"]) {
        case "ContentManagement.Entry.publish":
            const spaceId = req.body.sys.space.sys.id;
            mgmtClient.getSpace(spaceId).then(space => {
                switch (req.body.sys.contentType.sys.id) {
                    case "article":
                    case "video":
                        importArticleAndVideo(req, space);
                        break;
                    case "category":
                        importCategory(req, space);
                        break;
                    case "country":
                        importCountry(req, space);
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
