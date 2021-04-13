const _ = require("lodash");

function cleanUpHTML(h) {
    //console.log("cleanUpHTML-> original", h)
    let processedHtml = h
        .replace(/(<img("[^"]*"|[^\/">])*)>/gi, '$1 />')
        .replace(/<meta (.*)[^\/]>/gi, '<meta $1 />')
        .replace(/(<br[^/>]*)>/gm, "$1 />")
        .replace(/(<link[^/>]*)>/gm, "$1 />")
        .replace(/(<hr.*)>/gm, "<div class=\"hr\">---</div>")
        .replace(/<div (.*)\/>/gm, "<div $1></div>")
        .replace(/\"/gm, "'")
        .replace(/<u>(.*[\n\r\s\t]+.*)<\/u>/gmi, "$1");

    processedHtml = processedHtml
        .replace(/&#xA0;/g, "&nbsp;")
        .replace(/&nbsp;/g, " ")
        .replace(/&#x([0-9ABCDEFabcdef]+);/g, function (match, dec) {
            return String.fromCharCode(parseInt(`0x${dec}`, 16));
        })
        .replace(/<sup><\/sup>/gim, "");
    //console.log("cleanUpHTML-> returned", processedHtml)
    return processedHtml
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
