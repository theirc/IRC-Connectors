const crypto = require("crypto");
const Promise = require("bluebird");
const _ = require("lodash");
const request = require("request");
const cheerio = require("cheerio");
const contentful = require("contentful-management");
const transifexUtils = require('./transifex-utils');

const { signpostEntityPrefixes } = require("../config");

require('dotenv').config();

const {
    cleanUpHTML
} = require("./utils");
const {
    transifexToSpaceDictionary,
    contenfulLanguageDictionary,
    defaultContentfulSpace
} = require("../config");
const toMarkdown = require("to-markdown");
const contentfulManagement = require("contentful-management");

const CONTENTFUL_API_TOKEN = process.env.CONTENTFUL_API_TOKEN;

const client = contentfulManagement.createClient({
    accessToken: CONTENTFUL_API_TOKEN,
});

function transformIncomingText(content) {
    content = content.replace("{\"key\": \"", "").replace("\"}", "")
    console.log("transformIncomingText -> original: " + content)
    // Closing self closing tags
    //
    let processedHtml = cleanUpHTML(content);
    let $ = cheerio.load(processedHtml);
    console.log('Dollar Sign 1:', $.html());

    const title = $(".title").remove();
    const subtitle = $(".subtitle").remove();
    const hero = $("img", subtitle).remove();


    console.log('Dollar Sign:', $.html());
    const parsedContent = toMarkdown($.html());//.replace(/<div class="hr">---<\/div>/gi, "---");
    console.log('Parsed Content', parsedContent);
    return {
        title: title.text() ? title.text() : null,
        lead: subtitle.html() ? toMarkdown(subtitle.html() || "") : null,
        content: parsedContent,
    };
}

function updateContentful(spaceId, slug, language, payload, contentType) {
    console.log("Updating Contentful space: " + spaceId)
    return client
        .getSpace(spaceId)
        .then(s =>
            s.getEntries({
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

                console.log("Contentful Payload ->" + JSON.stringify(payload, null, 4));
                Object.keys(payload).forEach(k => {
                    let field = entry.fields[k] || {
                        [contentfulLanguage]: ""
                    };

                    field[contentfulLanguage] = payload[k];
                });

                // Save and publish
                console.log("Updating", language, slug);
                return entry.update().then(e => {
                    console.log("publishing: " + JSON.stringify(e))
                    e.publish()
                });
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

    switch (event) {
        case "review_completed":
        case "translation_completed":
            //Check if transifex project needs to update Contentful:
            if (project === process.env.TRANSIFEX_PROJECT_SLUG_CONTENTFUL
                || project.includes("contentful")
            ) {
                transifexUtils.getResourceTranslationHTML(project, resource, language).then(t => {
                    //Update Contentful with the new translation
                    let spaceId = transifexToSpaceDictionary[project] ? transifexToSpaceDictionary[project] : defaultContentfulSpace;
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
                                                return entry.update().then(e => {
                                                    consoile.log("publishing: " + JSON.stringify(e))
                                                    e.publish()
                                                });
                                            }
                                        });
                                })
                        ).then(() => {
                            console.log("Success")
                        });
                    } else {
                        console.log("t->transformIncomingText: " + JSON.stringify(t))
                        let payload = transformIncomingText(t);
                        /*let payload = {
                            title: t.data[0].attributes.strings ? t.data[0].attributes.strings.other : '',
                            lead: t.data[1].attributes.strings ? t.data[1].attributes.strings.other : '',
                            content: ''
                        };
                        for (let i = 2; i < t.data.length; i++) {
                            if (t.data[i].attributes.strings && t.data[i].attributes.strings.other)
                                payload.content += '<p>' + t.data[i].attributes.strings.other + '</p>';
                        };*/
                        let contentType = "article";
                        updateContentful(spaceId, slug, language, payload, contentType).then(p => {

                        });
                    }
                })
            }
            else {
                transifexUtils.getResourceTranslation(project, resource, language).then(t => {
                    //Update Entity in the database with the new translation, based in the slug entity prefix
                    let entityPrefix = resource.substr(0, 4);
                    switch (entityPrefix) {
                        case signpostEntityPrefixes.services:
                            updateServiceInCMS(resource, language, t, (e, r, b) => { });
                            break;
                        case signpostEntityPrefixes.providers:
                            updateProviderInCMS(resource, language, t, (e, r, b) => { });
                            break;
                        case signpostEntityPrefixes.serviceCategories:
                            updateServiceCategoryInCMS(resource, language, t, (e, r, b) => { });
                            break;
                        case signpostEntityPrefixes.providerCategories:
                            updateProviderCategoryInCMS(resource, language, t, (e, r, b) => { });
                            break;
                        default:
                            console.log("entityPrefix: " + entityPrefix + " not matching any defined prefixes: " + JSON.stringify(signpostEntityPrefixes))
                            //OLD CMS translations fix:
                            if (project === "refugeeinfo-services") {
                                updateServiceInCMS(resource, language, t, (e, r, b) => { })
                            }
                            break;
                    }

                });
            }
    };
    res.sendStatus(200);
};

function updateServiceInCMS(resource, language, translation, callback) {
    console.log("translation: " + JSON.stringify(translation))
    let description = "", i = 1, name = translation.data[0].attributes.strings.other;
    for (i = 1; i < translation.data.length; i++) {
        description += '<p>' + translation.data[i].attributes.strings.other.replace("\"}", "") + '</p>'
    };
    if (description == "") {
        //Update for services that are not coming in the correct format for Title & Subtitle:
        let html = translation.data[0].attributes.strings.other.split("<div class='subtitle'></div>");
        name = html[0].replace("<div class='title'>","").replace("</div>","").replace("<body>","").replace("<html>","");
        description = html[1].replace("</body>","").replace("</html>","");;
    }
    let uri = `${process.env.SIGNPOST_API_URL}/services/translations`;
    let requestData = {
        method: 'POST',
        uri,
        headers: {
            'Content-Type': "application/json"
        },
        json: true,
        body: {
            slug: resource,
            language: language,
            name: name,
            description: description
        }
    };
    console.log("requestData: " + JSON.stringify(requestData))
    request(requestData, (e, r, b) => {
        if (e) {
            console.log("updateServiceInCMS -> Error: ", e)
        }
        console.log("updateServiceInCMS -> Response: ", JSON.stringify(r))
        callback(e, r, b)
    })
}

function updateProviderCategoryInCMS(resource, language, translation, callback) {
    console.log("translation: " + JSON.stringify(translation))
    let uri = `${process.env.SIGNPOST_API_URL}/provider-categories/translations`;
    let requestData = {
        method: 'POST',
        uri,
        headers: {
            'Content-Type': "application/json"
        },
        json: true,
        body: {
            slug: resource,
            language: language,
            name: translation.data[0].attributes.strings.other,
            description: translation.data[1] ? translation.data[1].attributes.strings.other : null,
        }
    };
    console.log("requestData: " + JSON.stringify(requestData))
    request(requestData, (e, r, b) => {
        if (e) {
            console.log("updateServiceInCMS -> Error: ", e)
        }
        console.log("updateServiceInCMS -> Response: ", JSON.stringify(r))
        callback(e, r, b)
    })
}

function updateServiceCategoryInCMS(resource, language, translation, callback) {
    console.log("translation: " + JSON.stringify(translation))
    let uri = `${process.env.SIGNPOST_API_URL}/service-categories/translations`;
    let requestData = {
        method: 'POST',
        uri,
        headers: {
            'Content-Type': "application/json"
        },
        json: true,
        body: {
            slug: resource,
            language: language,
            name: translation.data[0].attributes.strings.other,
            description: translation.data[1] ? translation.data[1].attributes.strings.other : null,
        }
    };
    console.log("requestData: " + JSON.stringify(requestData))
    request(requestData, (e, r, b) => {
        if (e) {
            console.log("updateServiceInCMS -> Error: ", e)
        }
        console.log("updateServiceInCMS -> Response: ", JSON.stringify(r))
        callback(e, r, b)
    })
}

function updateProviderInCMS(resource, language, translation, callback) {
    console.log("translation: " + JSON.stringify(translation))
    let uri = `${process.env.SIGNPOST_API_URL}/providers/translations`;
    let requestData = {
        method: 'POST',
        uri,
        headers: {
            'Content-Type': "application/json"
        },
        json: true,
        body: {
            slug: resource,
            language: language,
            name: translation.data[0].attributes.strings.other,
            description: translation.data[1] ? translation.data[1].attributes.strings.other : null,
        }
    };
    console.log("requestData: " + JSON.stringify(requestData))
    request(requestData, (e, r, b) => {
        if (e) {
            console.log("updateServiceInCMS -> Error: ", e)
        }
        console.log("updateServiceInCMS -> Response: ", JSON.stringify(r))
        callback(e, r, b)
    })
}