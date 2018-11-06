const VERIFICATION_STRING = process.env.VERIFICATION_STRING || "VerifyMe";
const FB_AUTH_KEY = process.env.FB_AUTH_KEY;
const _ = require("lodash");

var {
    FB,
    FacebookApiException
} = require("fb");

const REGEX = /.*(?:\+?(\d{1,3}))?[-. (]*(\d{1,})[-. )]*(\d{2,})[-. ]*(\d{2,})(?: *x(\d+))?.*/gi;
const EREGEX = /\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/gi;
const IDREGEX = /id=\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*/gi;
const SREGEX = /\/*\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*\//gi;

module.exports = function (req, res) {
    if (
        req.query["hub.mode"] &&
        req.query["hub.mode"] === "subscribe" &&
        req.query["hub.verify_token"] === VERIFICATION_STRING
    ) {
        res.send(req.query["hub.challenge"]);
    } else {
        if (FB_AUTH_KEY) {
            FB.setAccessToken(FB_AUTH_KEY);
            try {
                /** 
                 * The Code below will filter out comments that have a phone number in them
                 */
                let a = req.body;
                let changes = a.entry
                    .map(e =>
                        e.changes.filter(
                            c =>
                            c.value.item === "comment" &&
                            c.value.verb !== "hide"
                        )
                    )
                    .filter(e => e.length);
                changes = _.flattenDeep(changes);
                for (let entry of changes) {
                    let message = entry.value.message;
                    let comment_id = entry.value.comment_id;

                    // Converting from Arabic / Farsi numerals to 'murican numbers
                    message = message
                        .replace(/٠/g, 0)
                        .replace(/١/g, 1)
                        .replace(/٢/g, 2)
                        .replace(/٣/g, 3)
                        .replace(/٤/g, 4)
                        .replace(/٥/g, 5)
                        .replace(/٦/g, 6)
                        .replace(/٧/g, 7)
                        .replace(/٨/g, 8)
                        .replace(/٩/g, 9);

                    console.log(entry.value.message);
                    let hasNumbers =
                        REGEX.test(message) || EREGEX.test(message);
                    let isActuallyALink =
                        IDREGEX.test(message) || SREGEX.message;

                    if (hasNumbers && !isActuallyALink) {
                        FB.api(
                            `/${comment_id}`,
                            "POST", {
                                is_hidden: true,
                            },
                            function (response2) {
                                console.log(response2);
                                if (response2 && !response2.error) {
                                    /* handle the result */
                                }
                            }
                        );
                    }
                }
            } catch (e) {}
        }
        res.send(200);
    }
};
