const request = require("request");
const {
    cleanUpHTML
} = require("./utils");

const Remarkable = require("remarkable");

const md = new Remarkable("full", {
    html: true,
    linkify: true,
    typographer: false,
    breaks: true,
});

const TRANSIFEX_ORGANIZATION_SLUG = process.env.TRANSIFEX_ORGANIZATION_SLUG

function generateContentForTransifex(article) {
    let lead, title, content;
    if (article.title) {
        lead = article.lead
            , title = article.title
            , content = article.content
    } else {
        lead = article.fields.lead
            , title = article.fields.title
            , content = article.fields.content
    }
    lead = lead ? cleanUpHTML(md.render(lead)) : '';
    content = lead ? cleanUpHTML(md.render(content)) : '';

    let body = `<html><body><div class="title">${title}</div><div class="subtitle">${lead}</div>${content}</body></html>`;

    return body;
}

function unicodeEscape(str) {
    let ret = str.replace(/[\s\S]/g, function (character) {
        var escape = character.charCodeAt().toString(16),
            longhand = escape.length > 2;
        if (!longhand) {
            return character;
        }
        return '&#' + ('x') + ('0000' + escape).slice(longhand ? -4 : -2) + ';';
    });
    //console.log("unicodeEscape: " + ret);
    return ret;
}

function getTransifexResourceBySlug(project, slug, callback) {
    var options = {
        'method': 'GET',
        'url': `${process.env.TRANSIFEX_API_URL_v3}/resources/o:${process.env.TRANSIFEX_ORGANIZATION_SLUG}:p:${project}:r:${slug}`,
        'headers': {
            'Authorization': 'Bearer ' + process.env.TRANSIFEX_API_TOKEN,
            'Cookie': 'AWSALB=pF31Pi+kG1MKxAfaW9mjX71drgBzk5is4w/4rSPeMYnl4Cd7eC0Dm3w6PiFXMYVdFEVb+6UAZYpA1mZmoCj730fGjAsGGWM94ngp1xROolV3oVUPBTaNU46EYy9A; AWSALBCORS=pF31Pi+kG1MKxAfaW9mjX71drgBzk5is4w/4rSPeMYnl4Cd7eC0Dm3w6PiFXMYVdFEVb+6UAZYpA1mZmoCj730fGjAsGGWM94ngp1xROolV3oVUPBTaNU46EYy9A'
        }
    };
    console.log("options", options);
    request(options, function (error, response, body) {
        if (error) {
            console.log(error);
            throw new Error(error);
        }
        console.log(response.body);
        callback(error, response, body)
    });
}

function createTransifexResource(project, payload, callback) {
    if (project == null) {
        project = process.env.TRANSIFEX_PROJECT_SLUG
    }
    var request = require('request');
    var options = {
        method: 'POST',
        url: `${process.env.TRANSIFEX_API_URL_v3}/resources`,
        headers: {
            'Content-Type': 'application/vnd.api+json',
            'Authorization': 'Bearer ' + process.env.TRANSIFEX_API_TOKEN

        },
        body:
            JSON.stringify({
                data: {
                    attributes: payload,
                    relationships: {
                        project: {
                            data: {
                                id: "o:" + process.env.TRANSIFEX_ORGANIZATION_SLUG + ":p:" + project,
                                type: "projects"
                            }
                        }
                    }, type: "resources"
                }
            })

    };
    console.log("options: " + JSON.stringify(options))
    request(options, function (error, response) {
        if (error) {
            console.log(error);
            throw new Error(error);
        }
        console.log(response.body);
        callback(error, response)
    });
}

function uploadTransifexResourceFile(project, slug, content, callback) {
    if (project == null) {
        project = process.env.TRANSIFEX_PROJECT_SLUG
    }
    var options = {
        method: 'POST',
        url: `${process.env.TRANSIFEX_API_URL_v3}/resource_strings_async_uploads`,
        headers: {
            'Content-Type': 'application/vnd.api+json',
            'Authorization': 'Bearer ' + process.env.TRANSIFEX_API_TOKEN

        },
        body:
            JSON.stringify({
                data: {
                    attributes: {
                        content: content,
                        content_encoding: 'text'
                    },
                    relationships: {
                        resource: {
                            data: {
                                id: "o:" + process.env.TRANSIFEX_ORGANIZATION_SLUG + ":p:" + project + ":r:" + slug,
                                type: "resources"
                            }
                        }
                    }, type: "resource_strings_async_uploads"
                }
            })

    };
    console.log("uploadTransifexResourceFile -> options: " + JSON.stringify(options))
    request(options, function (error, response) {
        if (error) {
            console.log(error);
            throw new Error(error);
        }
        console.log("uploadTransifexResourceFile -> response: " + response.body);
        callback(error, response)
    });
}

function getResourceTranslation(project, key, l) {
    var options = {
        method: 'GET',
        url: `${process.env.TRANSIFEX_API_URL_v3}/resource_translations?filter[resource]=o:${TRANSIFEX_ORGANIZATION_SLUG}:p:${project}:r:${key}&filter[language]=l:${l}`,
        headers: {
            'Content-Type': 'application/vnd.api+json',
            'Authorization': 'Bearer ' + process.env.TRANSIFEX_API_TOKEN

        },
    };
    console.log("getResourceTranslation -> options: " + JSON.stringify(options))
    return new Promise((resolve, reject) => {
        request(options, function (error, response, body) {
            if (error) {
                console.log(error);
                return reject(error);
            }
            console.log("getResourceTranslation -> response: " + body);
            return resolve(JSON.parse(body))
        });

    });
}

function getTransifexTranslationStatus(project, slug, callback) {
    var options = {
        'method': 'GET',
        'url': `${process.env.TRANSIFEX_API_URL_v3}/resource_language_stats?filter[project]=o:${process.env.TRANSIFEX_ORGANIZATION_SLUG}:p:${project}&filter[resource]=o:${process.env.TRANSIFEX_ORGANIZATION_SLUG}:p:${project}:r:${slug}`,
        'headers': {
            'Authorization': 'Bearer ' + process.env.TRANSIFEX_API_TOKEN,
            'Cookie': 'AWSALB=pF31Pi+kG1MKxAfaW9mjX71drgBzk5is4w/4rSPeMYnl4Cd7eC0Dm3w6PiFXMYVdFEVb+6UAZYpA1mZmoCj730fGjAsGGWM94ngp1xROolV3oVUPBTaNU46EYy9A; AWSALBCORS=pF31Pi+kG1MKxAfaW9mjX71drgBzk5is4w/4rSPeMYnl4Cd7eC0Dm3w6PiFXMYVdFEVb+6UAZYpA1mZmoCj730fGjAsGGWM94ngp1xROolV3oVUPBTaNU46EYy9A'
        }
    };
    console.log("options", options);
    request(options, function (error, response, body) {
        if (error) {
            console.log(error);
            throw new Error(error);
        }
        console.log(response.body);
        callback(error, response, body)
    });
}

module.exports = {
    generateContentForTransifex
    , unicodeEscape
    , getTransifexResourceBySlug
    , createTransifexResource
    , uploadTransifexResourceFile
    , getResourceTranslation
    , getTransifexTranslationStatus
}