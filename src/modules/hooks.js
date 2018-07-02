const facebook = require('./facebook');
const contentful = require('./contentful');
const transifex = require('./transifex');

module.exports = {
    "/hooks/facebook/": facebook,
    "/hooks/contentful/": contentful,
    "/hooks/transifex/": transifex,
};
