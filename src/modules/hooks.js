const facebook = require('./facebook');
const contentful = require('./contentful');
const transifex = require('./transifex');
const signpost = require('./signpost');
const transifexStatus = require('./transifexStatus');


module.exports = {
    "/hooks/facebook/": facebook,
    "/hooks/contentful/": contentful,
    "/hooks/transifex/": transifex,
    "/hooks/signpost/": signpost,
    "/hooks/transifexStatus/": transifexStatus
};
