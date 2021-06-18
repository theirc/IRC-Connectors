require('dotenv').config();
const request = require("request");

const transifexUtils = require('./transifex-utils');

let  project = process.env.TRANSIFEX_PROJECT_SLUG_SERVICES;


module.exports = function (req, res) {
    //Every time a Service is posted to this hook get Transifex Resource Translation
    const {
        service,
        language
    } = req.body;

    console.log('req.body', req.body);

    if (!service || !service.slug) {
        console.log("Wrong Service data.");
        return res.status(400).send("Wrong Service data.");
    }
    if(service.project){
        project = service.project
    }
    //Checking status of translation
    console.log("Checking status of translation");
    transifexUtils.getTransifexTranslationStatus(project, service.slug, (__e, r, __b) => {
        if (r.statusCode === 200) {
            let _lan = '';
            let _res = [];
            JSON.parse(r.body).data.forEach(d => {
                _lan = d.id.substr(d.id.indexOf(":l:")+3, d.id.length)
                _res.push({lan: _lan, pct: d.attributes.translated_words / d.attributes.total_words * 100})
                console.log("Resource: " + service.slug, "Language: " + _lan, "% Translated: " + d.attributes.translated_words / d.attributes.total_words * 100)
            })
            return res.status(200).send(_res);
        } else {
            //console.log("An error ocurred", __e, r)
            return res.status(500).send({ message: 'Error', error: __e, response: r });
        }
    })
};
