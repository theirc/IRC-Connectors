const _ = require("lodash");

function cleanUpHTML(h) {
	return h
		.replace(/&#xA0;/g, "&nbsp;")
		.replace(/&#x([0-9ABCDEFabcdef]+);/g, function(match, dec) {
			return String.fromCharCode(parseInt(`0x${dec}`, 16));
		})
		.replace(/<sup><\/sup>/gim, "");
}
const promiseSerial = funcs => funcs.reduce((promise, func) => promise.then(result => func().then(Array.prototype.concat.bind(result))), Promise.resolve([]));

function reverseMap(map) {
	return _.fromPairs(Object.keys(map).map(k => [map[k], k]));
}

module.exports = {
	cleanUpHTML,
	promiseSerial,
	reverseMap,
};
