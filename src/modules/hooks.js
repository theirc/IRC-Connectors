const facebook = require('./facebook');
const contentful = require('./contentful-v3');
const transifex = require('./transifex');
const signpost = require('./signpost');

module.exports = {
    "/hooks/facebook/": facebook,
    "/hooks/contentful/": contentful,
    "/hooks/transifex/": transifex,
    "/hooks/signpost/": signpost
};
