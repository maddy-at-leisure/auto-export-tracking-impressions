const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const { Client } = require('pg');
const {redshiftConfig, googleSheetsConfig, googleApiCredentials} = require('./config');
const {spreadsheetId, sheetName} = googleSheetsConfig;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'config/token.json';
let sheets;
let valueInputOption = 'RAW';

function authorizeGoogle(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            // Save the token to file
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

function connectRedshift() {
    const client = new Client(redshiftConfig);
    client.connect().then(() => {
        console.log('connected at '+new Date().toLocaleString());
        client.query('select * from viewable_impression_by_airlines')
            .then(res => {
                console.log("query done at "+new Date().toLocaleString());
                client.end();
                const rows = [['airline', 'events']];
                for(row of res.rows){
                    rows.push([row.airline, row.events])
                }
                setRows(rows);
            })
            .catch(e => {
                console.log("query failed!");
                console.log(e.stack);
                client.end();
            })
        })
        .catch (error => {
        console.log(error)
    });
}

function setRows(rows) {
    let values = rows;
    const resource = { values };
    sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A:B`,
        valueInputOption,
        resource,
    }, (err, result) => {
        if (err) {
            console.log(`Error updating google sheet: ${err}`);
        } else {
            console.log(`${result.data.updatedCells} cells updated.`);
        }
    });
}

authorizeGoogle(googleApiCredentials, auth => {
    sheets = google.sheets({ version: 'v4', auth});
    connectRedshift();
});