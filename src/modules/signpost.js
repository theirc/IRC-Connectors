require('dotenv').config();
const request = require("request");

const transifexUtils = require('./transifex-utils');

const TRANSIFEX_API_TOKEN = process.env.TRANSIFEX_API_TOKEN;
//const project = process.env.TRANSIFEX_PROJECT_SLUG_SERVICES;
const project = process.env.TRANSIFEX_PROJECT_SLUG_SERVICES;


module.exports = function (req, res) {
    //Every time a Service is posted to this hook Create or update Transifex Resource
    const {
        service,
        language
    } = req.body;

    console.log('req.body', req.body);

    if (!service || !service.name || !service.slug) {
        console.log("Wrong Service data.");
        return res.status(400).send("Wrong Service data.");
    }
    console.log("generateContentForTransifex");
    let content = transifexUtils.generateContentForTransifex({
        lead: service.additionalInformation,
        title: service.name,
        content: service.description
    })

    console.log("generatePayloadForTransifex");
    let payload = {
        slug: service.slug,
        name: service.name,
        i18n_type: "XHTML",
        accept_translations: true,
        categories: service.categories
    };

    //Checking if resource is already created
    console.log("Checking if resource is already created");
    transifexUtils.getTransifexResourceBySlug(project, payload.slug, (__e, r, __b) => {
        //if article doesn't exists, create it, else update it:
        if (r.statusCode === 404) {
            //if article doesn't exists, create it, else update it:
            console.log("createTransifexResource");
            let promise = new Promise((resolve, reject) => {
                transifexUtils.createTransifexResource(
                    project,                                //project
                    payload,                                //payload
                    (e1, r1, b1) => {
                        if (e1) {
                            console.log("return reject(e1);")
                            reject(e1);
                        }
                        if (r1.statusCode > 201) {
                            //upload error to Slack
                            console.log('upload error to Slack Error', payload.slug);
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
                            return reject(r1);
                        }
                        else {
                            console.log("uploadTransifexResourceFile");
                            transifexUtils.uploadTransifexResourceFile(
                                project,
                                service.slug,
                                transifexUtils.unicodeEscape(content),                            //project
                                (e1, r1, b1) => {
                                    if (e1) {
                                        console.log("return reject(e1);")
                                        return reject(e1);
                                    }
                                    if (r1.statusCode > 202) {
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
                                        return reject(r1);
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
                                            resolve(r1)
                                        })
                                    }
                                });
                        }
                    }
                );
            })
            promise
                .then((r) => {
                    console.log("{message: 'Created in Transifex', resourceId: "+ r.body.data.id +"}");
                    return res.status(200).send({message: 'Created in Transifex', resourceId: r.body.data.id});
                })
                .catch(e => {
                    //console.log("Error", e)
                    return res.status(500).send({message: 'Error en catch 1', error: e});
                })
        } else if (r.statusCode === 200) {
            console.log("Resource already exists in Transifex");
            let promise = new Promise((resolve, reject) => {
                transifexUtils.uploadTransifexResourceFile(
                    project,
                    service.slug,
                    transifexUtils.unicodeEscape(content),                            //project
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
                            return reject(r1);
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
                        resolve(r1)
                    });
            })
            promise
                .then((r) => {
                    console.log("{message: 'Created in Transifex', resourceId: "+ JSON.stringify(r) +"}");
                    return res.status(200).send({message: 'Created in Transifex', resourceId: JSON.parse(r.body).data.id});
                })
                .catch(e => {
                    console.log({message: 'Error en catch', error: e});
                    return res.status(500).send({message: 'Error en catch 2', error: e});
                });
        } else {
            //console.log("An error ocurred", __e, r)
            return res.status(500).send({message: 'Error', error: __e, response: r});
        }
    })
};
