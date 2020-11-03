const crypto = require("crypto");
const Promise = require("bluebird");
const _ = require("lodash");
const request = require("request");
const cheerio = require("cheerio");
const contentful = require("contentful-management");

require('dotenv').config();

const {
    cleanUpHTML
} = require("./utils");
const {
    transifexToSpaceDictionary,
    contenfulLanguageDictionary
} = require("../config");
const toMarkdown = require("to-markdown");
const contentfulManagement = require("contentful-management");

const TRANSIFEX_API_TOKEN = process.env.TRANSIFEX_API_TOKEN;
const CONTENTFUL_API_TOKEN = process.env.CONTENTFUL_API_TOKEN;

const client = contentfulManagement.createClient({
    accessToken: CONTENTFUL_API_TOKEN,
});

function resourceTranslationRequest(project, key, l) {
    return new Promise((resolve, reject) => {
        request
            /*------- API v2 ----
                .get(`https://www.transifex.com/api/2/project/${project}/resource/${key}/translation/${l}/`, (e, r, b) => {
                    if (e) {
                        reject(e);
                        return;
                    }
                    try {
                        resolve(JSON.parse(b));
                    } catch (e) {
                        //reject(e);
                        console.log("Error", b);
                        reject(null);
                    }
                })
                .auth("api", TRANSIFEX_API_TOKEN, false);
            ------- API v2 -----*/

            /*------- API v3 -----*/
            .get(`${process.env.TRANSIFEX_API_URL_v3}/resource_translations?filter[resource]=o:${project}:p:${project}:r:${key}&filter[language]=l:${l}`, (e, r, b) => {
                if (e) {
                    reject(e);
                    return;
                }
                try {
                    resolve(JSON.parse(b));
                } catch (e) {
                    //reject(e);
                    console.log("Error", b);
                    reject(null);
                }
            })
            .oauth('Authorization: Bearer ', TRANSIFEX_API_TOKEN, false)
    });
}

function transformIncomingText(content) {
    // Closing self closing tags
    //
    let processedHtml = cleanUpHTML(content);
    let $ = cheerio.load(processedHtml);
    console.log('Dollar Sign 1:', $.html());

    const title = $(".title").remove();
    const subtitle = $(".subtitle").remove();
    const hero = $("img", subtitle).remove();


    console.log('Dollar Sign:', $.html());
    const parsedContent = toMarkdown($.html()).replace(/<div class="hr">---<\/div>/gi, "---");
    console.log('Parsed Content', parsedContent);
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
        .catch(error => {
            console.error(error);
        })
        .then(({
            entry,
            space
        }) => {
            if (entry) {
                const contentfulLanguage = contenfulLanguageDictionary[language] || language;

                console.log(JSON.stringify(payload, null, 4));
                Object.keys(payload).forEach(k => {
                    let field = entry.fields[k] || {
                        [contentfulLanguage]: ""
                    };

                    field[contentfulLanguage] = payload[k];
                });

                // Save and pubish
                console.log("Updating", language, slug);
                return entry.update(); //.then(e => e.publish());
            }
        })
        .catch(error => {
            console.error(error);
        });
}

module.exports = function (req, res) {
    const {
        project,
        resource,
        event,
        language,
        reviewed
    } = req.body;

    console.log('req.body', req.body);

    // const sign_v2 = (url, date, data, secret) => {
    //     const content_md5 = md5(data);
    //     const msg = ["POST", url, date, content_md5].join("\n");
    //     const hmac = crypto.createHmac("sha256", secret);
    //     return hmac
    //         .update(msg)
    //         .digest()
    //         .toString("base64");
    // };

    switch (event) {
        case "review_completed":
        case "translation_completed":
            resourceTranslationRequest(project, resource, language).then(t => {
                //Check if transifex project needs to update Contentfull:
                if (project != process.env.TRANSIFEX_PROJECT_SLUG_SERVICES) {
                    //Update Contentful with the new translation
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
                                        .then((space) =>
                                            space
                                                .getEntries({
                                                    "fields.slug": k,
                                                    content_type: "category"
                                                })
                                                .then(entries => entries.total > 0 && space.getEntry(entries.items[0].sys.id))
                                                .then(entry => ({
                                                    entry: entry,
                                                    space: space,
                                                }))
                                        )
                                        .then(({
                                            entry,
                                            space
                                        }) => {
                                            if (entry) {
                                                console.log(JSON.stringify(updatePayload, null, 4));
                                                const contentfulLanguage = contenfulLanguageDictionary[language] || language;
                                                Object.keys(updatePayload).forEach(uk => {
                                                    let field = entry.fields[uk] || {
                                                        [contentfulLanguage]: ""
                                                    };

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


                        updateContentful(spaceId, slug, language, payload, contentType).then(p => { });
                    }
                }
                //Update Service in the database with the new translation
                else {
                    updateServiceInCMS(resource, language, (e, r, b) => {

                    });
                }
            });
            break;

        default:
            break;
    }

    res.sendStatus(200);
};

function updateServiceInCMS(resource, language, callback) {
    //TO DO: integrate function with Signpost CMS
    let uri = `${process.env.SIGNPOST_API_URL}/`;
    let requestData = {
        method: 'PUT',
        uri,
        headers: {
            'Content-Type': "application/vnd.api+json"
            ,'Authorization': 'Bearer ' + process.env.TRANSIFEX_API_TOKEN,
        },
        json: true,
        body: {
            data: {
                attributes: payload,
                relationships: {
                    project: {
                        data: {
                            id: "o:" + process.env.TRANSIFEX_ORGANIZATION_SLUG + ":p:" + project,
                            type: "projects"
                        }
                    }
                },
                type: "resources"
            }
        }
    };
    console.log("requestData: " + JSON.stringify(requestData))

    request(requestData, (e, r, b) => { callback(e, r, b) })
}