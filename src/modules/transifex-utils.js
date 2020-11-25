const request = require("request");
const {
    cleanUpHTML
} = require("./utils");

const Remarkable = require("remarkable");

let {
    transifexToSpaceDictionary,
} = require("../config");

const md = new Remarkable("full", {
    html: true,
    linkify: true,
    typographer: false,
    breaks: true,
});

function generateContentForTransifex(article) {
    let lead, title, content;
    let _article;
    //the data can come inside article, or article.fields:
    if (!article.title)
        _article = article.fields
    else
        _article = article
    title = _article.title ? _article.title : ''
    lead = _article.lead ? cleanUpHTML(md.render(_article.lead)) : '';
    content = _article.content ? cleanUpHTML(md.render(_article.content)) : '';

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
            //throw new Error(error);
        }
        //console.log(response.body);
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
        json: true,
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
            //throw new Error(error);
        }
        //console.log(response.body);
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
    request(options, function (error, response, body) {
        if (error) {
            console.log(error);
            //throw new Error(error);
        }
        console.log("uploadTransifexResourceFile -> response: " + response.body);
    });
}


function getResourceTranslationAsync(project, key, l) {
    var options = {
        method: 'GET',
        url: `${process.env.TRANSIFEX_API_URL_v3}/resource_translations?filter[resource]=o:${process.env.TRANSIFEX_ORGANIZATION_SLUG}:p:${project}:r:${key}&filter[language]=l:${l}`,
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

function getResourceTranslation(project, key, l) {
    var options = {
        method: 'POST',
        url: process.env.TRANSIFEX_API_URL_v3 + '/resource_translations_async_downloads',
        headers: {
            'Content-Type': 'application/vnd.api+json',
            'Authorization': 'Bearer ' + process.env.TRANSIFEX_API_TOKEN

        },
        json: true,
        body: {
            data: {
                type: 'resource_translations_async_downloads',
                attributes: {
                    content_encoding: 'text',
                    file_type: 'default',
                    mode: 'default',
                    pseudo: false
                },
                relationships: {
                    resource: {
                        data: {
                            type: 'resources',
                            id: `o:${process.env.TRANSIFEX_ORGANIZATION_SLUG}:p:${project}:r:${key}`
                        }
                    },
                    language: {
                        data: {
                            type: 'languages',
                            id: 'l:' + l
                        }
                    }
                }
            }
        }
    };
    console.log("getResourceTranslation -> options: " + JSON.stringify(options))
    return new Promise((resolve, reject) => {
        request(options, function (error, response, body) {
            if (error) {
                console.log(error);
                return reject(error);
            }
            console.log("getResourceTranslation -> response 1: " + JSON.stringify(body));
            //ask  the api for the id in the response:
            var options = {
                method: 'GET',
                url: process.env.TRANSIFEX_API_URL_v3 + '/resource_translations_async_downloads/' + body.data.id,
                headers: {
                    'Content-Type': 'application/vnd.api+json',
                    'Authorization': 'Bearer ' + process.env.TRANSIFEX_API_TOKEN
                }
            }
            request(options, function (error, response, body) {
                if (error) {
                    console.log(error);
                    return reject(error);
                }
                console.log("getResourceTranslation -> response 2: " + body);
                return resolve(JSON.parse(body))
            });
        });
    });
};

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
            //throw new Error(error);
        }
        //console.log(response.body);
        callback(error, response, body)
    });
}

function createArticleFileIdInCMS(slug, project, transifexFileId, callback) {
    console.log("createArticleFileIdInCMS -> " + JSON.stringify(slug))
    let uri = `${process.env.SIGNPOST_API_URL}articles`;
    let requestData = {
        method: 'POST',
        uri,
        headers: {
            'Content-Type': "application/json"
        },
        json: true,
        body: {
            slug: slug,
            contentfulProject: project,
            transifexFileId: transifexFileId
        }
    };
    console.log("createArticleFileIdInCMS -> requestData: " + JSON.stringify(requestData))
    request(requestData, (e, r, b) => {
        if (e) {
            console.log("createArticleFileIdInCMS -> Error: ", e)
        }
        console.log("createArticleFileIdInCMS -> response: ", r)
        callback(e, r)
    })
}

module.exports = {
    generateContentForTransifex
    , unicodeEscape
    , getTransifexResourceBySlug
    , createTransifexResource
    , uploadTransifexResourceFile
    , getResourceTranslation
    , getTransifexTranslationStatus
    , createArticleFileIdInCMS
}