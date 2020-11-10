const contentfulManagement = require("contentful-management");
const contentful = require("contentful");
const _ = require("lodash");
const transifexUtils = require('./transifex-utils');

const {
    promiseSerial,
    reverseMap,
    cleanUpHTML
} = require("./utils");
const Remarkable = require("remarkable");
const cheerio = require("cheerio");
const request = require("request");

require('dotenv').config();

const md = new Remarkable("full", {
    html: true,
    linkify: true,
    typographer: false,
    breaks: true,
});

const TRANSIFEX_API_TOKEN = process.env.TRANSIFEX_API_TOKEN;
const TRANSIFEX_ORGANIZATION_SLUG = process.env.TRANSIFEX_ORGANIZATION_SLUG;
const CONTENTFUL_API_TOKEN = process.env.CONTENTFUL_API_TOKEN;
const TRANSIFEX_API_URL = process.env.TRANSIFEX_API_URL_v3;
const TRANSIFEX_NEW_API_URL = process.env.TRANSIFEX_NEW_API_URL_v3;

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

function importArticleAndVideo(req, space) {
    const {
        body
    } = req;
    const spaceId = body.sys.space.sys.id;
    let locale = contentfulPrimaryLanguage[spaceId] ?
        contenfulLanguageDictionary[contentfulPrimaryLanguage[spaceId]] : "en";
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
        let content = transifexUtils.generateContentForTransifex(item);
        let {
            slug,
            title
        } = item.fields;

        if (item.sys.contentType.sys.id === "video") {
            slug = "video---" + slug;
        }

        let payload = {
            slug,
            name: title,
            i18n_type: "XHTML",
            accept_translations: true,
            categories: item.fields.country && item.fields.country.fields && item.fields.country.fields.slug ? [item.fields.country.fields.slug] : null,
        };

        let _content = transifexUtils.unicodeEscape(content);


        let promise = new Promise((resolve, reject) => {
            transifexUtils.getTransifexResourceBySlug(project, slug, (e,r,b) => {
                if (r.statusCode === 404) {
                    //if article doesn't exists, create it, else update it:
                    transifexUtils.createTransifexResource(
                        project,                                //project
                        payload,                                //payload
                        (e1, r1, b1) => {
                            if (e1) {
                                reject(e1);
                            }
                            if (r1.statusCode > 201) {
                                //upload error to Slack
                                console.log('Error', payload.slug);
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
                            else {
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
                transifexUtils.uploadTransifexResourceFile(project, slug, _content, (e1, r1, b1) => {
                    if (e1) {
                        reject(e1);
                    }
                    if (r1.statusCode > 201) {
                        //upload error to Slack
                        console.log('Error', payload.slug);
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
                    else {
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
                })
            })
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
            name: "Category Names And Descriptions",
            i18n_type: "KEYVALUEJSON",
            accept_translations: true,
        };

        let content = JSON.stringify(categoryDictionary);

        transifexUtils.getTransifexResourceBySlug(project, slug, (e, r) => {
            if (e) {
                console.log("getTransifexResourceBySlug Error: ", e);
            }
            //Revisar response a ver si el recurso ya existe
            if(r.statusCode === 404){
                //Si no existe crearlo y subirle el Resource file
                transifexUtils.createTransifexResource(project, payload, (e,r) =>{
                    if (e) {
                        console.log("createTransifexResource Error: " + e);
                    }
                    transifexUtils.uploadTransifexResourceFile(project, slug, content, (e,r) => {
                        if (e) {
                            console.log("createTransifexResource Error: " + e);
                        }
                        console.log("createTransifexResource Response: " + r);
                    })
                })
            } else{
                //Si existe subirle el Resource file
                transifexUtils.uploadTransifexResourceFile(project, slug, content, (e,r) => {
                    if (e) {
                        console.log("createTransifexResource Error: " + e);
                    }
                    console.log("createTransifexResource Response: " + r);
                })
            }
        })
    });
}

/**
 *
 *
 *
 */
module.exports = function (req, res) {
    console.log('Hook for contentful');
    switch (req.headers["x-contentful-topic"]) {
        case "ContentManagement.Entry.publish":
            const spaceId = req.body.sys.space.sys.id;
            mgmtClient.getSpace(spaceId).then(space => {
                switch (req.body.sys.contentType.sys.id) {
                    case "article": //do nothing
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
