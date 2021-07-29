const request = require("request");
const transifexUtils = require('./transifex-utils');

module.exports = function (req, res) {
    console.log('Hook for Zendesk');
    var zendeskUrl = "infopalante.org";
    var locale = "es-co";
    var lastUpdatedDate = "2021-07-27T15:22:52Z";
    var transifexProject = "cms-services-staging";
    fetchArticlesFromZendesk(zendeskUrl, locale, lastUpdatedDate, 1, [],
        (e, r) => {
            if (e) {
                res.send(e).status(500)
            } else {
                r.forEach(element => {
                    postArticleToTransifex(element, transifexProject);
                })
                res.send(r).status(200)
            }
        }
    );
};

/*  Fetch all articles in a zendesk instance and returns only the ones that were updated after lastUpdatedDate
*   -> lastUpdatedDate (String) => "2021-07-27T12:25:52Z"
*/
function fetchArticlesFromZendesk(zendeskUrl, locale, lastUpdatedDate, page = 1, result = [], callback) {
    var perPage = 100
    var uri = `https://${zendeskUrl}/api/v2/help_center/${locale}/articles.json?sort_by=updated_at&sort_order=desc&per_page=${perPage}&page=${page}`;
    let requestData = {
        method: 'GET',
        uri,
        headers: {
            'Content-Type': "application/json"
        },
        json: true,
    };
    request(requestData, (e, r, b) => {
        if (e) {
            console.log("fetchArticlesZendesk -> Error: ", e)
        }
        b.articles.forEach(element => {
            if (element.updated_at > lastUpdatedDate) {
                console.log("element.updated_at: " + element.updated_at)
                result.push({
                    title: element.title,
                    content: element.body,
                    slug: zendeskUrl.replace(".", "-") + "-" + element.id
                })
            }
        });
        // Check if more pages are needed:
        if (result.length == page * perPage) {
            fetchArticlesFromZendesk(zendeskUrl, locale, lastUpdatedDate, page + 1, result, callback);
        } else {
            //finished
            console.log("Finished: " + result.length)
            return callback(e, result)
        }
    })
}

function postArticleToTransifex(article, project) {
    var response = { status: 200, message: "OK" }
    //Every time a article is posted to this hook Create or update Transifex Resource
    console.log("generateContentForTransifex");
    let content = transifexUtils.generateContentForTransifex({
        content: article.content,
        title: article.title,
    })

    console.log("generatePayloadForTransifex");
    let payload = {
        slug: article.slug,
        name: article.title,
        accept_translations: true,
        categories: article.categories
    };
    //Checking if resource is already created
    console.log("Checking if resource is already created");
    transifexUtils.getTransifexResourceBySlug(project, payload.slug, (__e, r, __b) => {
        //if article doesn't exists, create it, else update it:
        if (r && r.statusCode === 404) {
            //if article doesn't exists, create it, else update it:
            console.log("createTransifexResource");
            let promise = new Promise((resolve, reject) => {
                transifexUtils.createTransifexResource(
                    project,                                 //project
                    payload,                                        //payload
                    (e1, r1, b1) => {
                        if (e1) {
                            console.log("return reject(e1);")
                            reject(e1);
                        }
                        if (r1 && r1.statusCode > 201) {
                            return reject(r1);
                        }
                        else {
                            console.log("uploadTransifexResourceFile");
                            transifexUtils.uploadTransifexResourceFile(
                                project,
                                payload.slug,
                                transifexUtils.unicodeEscape(content),
                                false,
                                (e1, r1, b1) => {
                                    if (e1) {
                                        console.log("return reject(e1);")
                                        return reject(e1);
                                    }
                                    if (r1 && r1.statusCode > 202) {
                                        return reject(r1);
                                    }
                                    resolve(r1)
                                });
                        }
                    }
                );
            })
            promise
                .then((r) => {
                    console.log("{message: 'Created in Transifex', resourceId: " + r.body.data.id + "}");
                    return response.message = 'Created in Transifex: ' + r.body.data.id
                })
                .catch(e => {
                    //console.log("Error", e)
                    return response.message = 'Error en catch 1: ' + e;
                })
        } else if (r && r.statusCode === 200) {
            console.log("Resource already exists in Transifex");
            //Upload resource:
            let promise = new Promise((resolve, reject) => {
                transifexUtils.uploadTransifexResourceFile(
                    project,
                    article.slug,
                    transifexUtils.unicodeEscape(content),
                    false,                            //project
                    (e1, r1) => {
                        console.log("r1: " + JSON.stringify(r1))
                        if (e1) {
                            console.log("return reject(e1);")
                            return reject(e1);
                        }
                        if (r1.statusCode > 202) {
                            //upload error to Slack
                            console.log('Error >202', payload.slug);
                            request({
                                method: 'post',
                                uri: 'https://hooks.slack.com/articles/T34MT22AY/B9LSKPKQS/c23XOl9ahBsfmkRsfdP6clf4',
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
                            return reject(r1);
                        }
                        else {
                            request({
                                method: 'post',
                                headers: {
                                    ContentType: "application/json",
                                },
                                json: true,
                                uri: 'https://hooks.slack.com/articles/T34MT22AY/B9LSKPKQS/c23XOl9ahBsfmkRsfdP6clf4',
                                body: {
                                    text: `Hi! I just uploaded ${payload.slug} successfully to transifex.`
                                }
                            }, () => {
                                console.log('Success Hooked')
                            })
                        }
                        resolve(r1)
                    });
            })
            promise
                .then((r) => {
                    console.log("{message: 'Created in Transifex', resourceId: " + JSON.stringify(r) + "}");
                    return response.message = 'Created in Transifex: ' + JSON.parse(r.body).data.id
                })
                .catch(e => {
                    console.log({ message: 'Error en catch', error: e });
                    return response.message = 'Error en catch 2: ' + e;
                });
        } else {
            console.log("An error ocurred", __e, r)
            return response.message = 'Error: ' + __e;
        }
    })
};