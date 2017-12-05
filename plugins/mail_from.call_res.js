// mail_from.call_res

// documentation via: haraka -c /Users/ktoso/code/smtp-cha-res -h plugins/mail_from.call_res

// Put your plugin code here
// type: `haraka -h Plugins` for documentation on how to create a plugin

const utils = require('haraka-utils');

//
const levelup = require('levelup');
const leveldown = require('leveldown');

// sending the challenges
var nodemailer = require('nodemailer');

exports.register = function () {
    const plugin = this;

    // const config = this.config.get('mail_from.call_res.ini');
    this.deny_msg = 'Will send challenge to: ';

    // configure database
    this.db = levelup(leveldown('./call_res_db'));
    store_ok_sender(plugin, this.db, 'konrad@malaw.ski');

    // configure nodemailer
    const p = 'lbztgezegcjhfwyz';
    this.transporter = nodemailer.createTransport('smtps://ktosopl%40gmail.com:' + p + '@smtp.gmail.com');

    this.register_hook('mail', 'mail_from_call_res');
}

exports.mail_from_call_res = function (next, connection, params) {
    const plugin = this;
    const mail_from = params[0].address();

    if (!mail_from) {
        connection.transaction.results.add(plugin, {skip: 'null sender', emit: true});
        return next();
    }

    // address whitelist checks
    connection.logdebug(plugin, 'checking ' + mail_from + ' against whitelist stored in ' + './call_res_db');


    const onAccept = function () {
        connection.logdebug(plugin, "Allowing " + mail_from);
        const reason = 'whitelisted';
        transaction_pass(connection, plugin, reason);
        return next();
    };

    const onReject = function () {
        // we need to store the email if not blacklisted and send a challenge back

        challenge_address(connection, plugin, mail_from, function () {
            connection.logdebug(plugin, "Sent the challenge to: " + mail_from);
        });

        transaction_fail(connection, plugin, 'challenged');
        return next(DENY, plugin.deny_msg + '[' + mail_from + ']');
    };

    _check_sender(connection, plugin, mail_from,
        onAccept, onReject
    );

}

function store_ok_sender(connection, plugin, address) {
    plugin.db.put(address, 'ok', function (err) {
        if (err) connection.logdebug(plugin, 'Failed to store [' + address + ']');
    });
}
function store_hit_gray_sender(connection, plugin, address) {
    plugin.db.get(address, function (err, value) {
       if (err) {

       } else {
           plugin.db.put(address, value + 1, function (err) { // FIXME make sure this is a number
               if (err) connection.logdebug(plugin, 'Failed to store [' + address + ']');
           });
       }
    });
}


function _check_sender (connection, plugin, address, yes, no) {
    plugin.db.get(address, function (err, value) {
        if (err) {
            connection.logdebug(plugin, 'The address [' + address + '] is NOT to be trusted, send it a challenge.');
            return no();
        }
        else {
            connection.logdebug(plugin, 'The address ['+ address +'] is indeed whitelisted already!');
            return yes();
        }
    });
}


function challenge_address(connection, plugin, address, next) {
    var message = {
        from: 'ktosopl@gmail.com',
        to: address,
        subject: 'Thank you for your email',
        text: 'Please complete this challenge...',
        html: '<p>Please complete this <b>challenge</b>...</p>'
    };

    // send mail with defined transport object
    plugin.transporter.sendMail(message, function(error, info){
        if(error) return console.log(error);
        connection.logdebug(plugin, 'Message sent: ' + info.response);
        next()
    });
}


// signal to Haraka that we want to `pass` this email
function transaction_pass(connection, plugin, reason) {
    connection.transaction.results.add(plugin, {pass: reason, emit: true});
}

// signal to Haraka that we want to `reject` this email
function transaction_fail(connection, plugin, reason) {
    connection.transaction.results.add(plugin, {fail: reason, emit: true});
}

