const hooks = require("./hooks.js");
module.exports = function() {
	const app = this; // eslint-disable-line no-unused-vars
	for (var k of Object.keys(hooks)) {
    console.log(k, hooks);
		app.use(k, hooks[k]);
	}
};
