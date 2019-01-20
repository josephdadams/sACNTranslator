/* sACN Translator */

//Streaming ACN library variables
var e131 = require('e131');
var server = null;

//express variables
const express = require('express');
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json({ type: 'application/json' }));

const http = require('http');
const http_server = http.Server(app);
const listenPort = 5000; //the port the API and web server runs on

//filesystem variables
const fs = require("fs");
const JSONdatafile = "sacn-data.json"; //local storage JSON file

//Local Arrays
var Universes = []; // universes on the network to listen to and look for data in
var Fixtures = []; // array of Fixture Objects to interact with

//app route setups

//simple web editing interface
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/views/index.html');
});

//about the author, this program, etc.
app.get('/about', function (req, res) {
    res.sendFile(__dirname + '/views/about.html');
});

//serve up any files in the static folder like images, CSS, client-side JS, etc.
app.use(express.static('views/static'));

//APIs
app.get("/api/restart", function (req, res) {
   //restarts the listening service, helpful if the universe array was modified
   RestartService();
   res.send({action: "restart-service", returnStatus: "success"});
});

app.get("/api/universes", function (req, res) {
   //gets all Fixture objects
   res.send(GetUniverses());
});

app.get('/api/universe/add/:universe', function (req, res) {
    //add the new universe object into the array
    let universe = parseInt(req.params.universe);
    let returnStatus = AddUniverse(universe);
    res.send({action: "universe-add", returnStatus: returnStatus});
 });
 
 app.get('/api/universe/delete/:universe', function (req, res) {
    //delete the universe index that already exists in the array
    let universe = parseInt(req.params.universe);
    let returnStatus = DeleteUniverse(universe);
    res.send({action: "universe-delete", returnStatus: returnStatus});
 });

app.get("/api/fixtures", function (req, res) {
   //gets all Fixture objects
   res.send(GetFixtures());
});

app.get("/api/fixture/:fixtureid", function (req, res) {
    //gets a specific fixture object
    let fixtureID = req.params.fixtureid;
    
    let fixtureObj = GetFixture(fixtureID);
    
    if (fixtureObj === null)
    {
        //return as invalid
        res.send({returnStatus: "invalid-fixture-id"});
    }
    else
    {
        res.send({returnStatus: "success", fixture: fixtureObj});
    }
});

app.post('/api/fixture/add', function (req, res) {
    console.log("fixture add received:");
    console.log(req.body);
    
    //add the new fixture object into the array
    let fixtureObj = AddFixture(req.body);
    if (fixtureObj !== null)
    {
        res.send({returnStatus: "success", fixture: fixtureObj});
    }
 });

 app.post('/api/fixture/update/:fixtureid', function (req, res) {
    //updates the fixture object that already exists in the array
    console.log("fixture add received:");
    console.log(req.body);
    
    let fixtureID = req.params.fixtureid;    
    let fixtureObj = UpdateFixture(fixtureID, req.body);
    
    if (fixtureObj !== null)
    {
        res.send({returnStatus: "success", fixture: fixtureObj});
    }
 });
 
  app.get('/api/fixture/delete/:fixtureid', function (req, res) {
    //updates the fixture object that already exists in the array
    console.log("delete fixture request received");
    let fixtureID = req.params.fixtureid;
    DeleteFixture(fixtureID);
    
    res.send({returnStatus: "success"});
 });
 
function loadFile() //loads settings on first load of app
{   
    let rawdata = fs.readFileSync(JSONdatafile);  
    let myJson = JSON.parse(rawdata); 
    
    if (myJson.Fixtures)
    {
        Fixtures = myJson.Fixtures;
        Universes = myJson.Universes;
    }
    
    if (Universes.length === 0)
    {
        Universes.push(1);
    }
}

function saveFile() //saves settings to a local storage file for later recalling on restarts, etc.
{
    var myJson = {        
        Fixtures: Fixtures,
        Universes: Universes
    };

    fs.writeFileSync(JSONdatafile, JSON.stringify(myJson, null, 1), "utf8", function(error) {
        if (error)
        { 
          console.log('error: ' + error);
        }
        else
        {
          console.log('file saved');
        }
    });
}

function uuidv4() //unique UUID generator for IDs
{
  return 'xxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

//Data Functions
function GetUniverses()
{    
    return Universes;
}

function AddUniverse(universe)
{
    let returnStatus = "";
    
    if (Number.isInteger(universe))
    {
        if ((universe > 0) && (universe <= 63999))
        {
            Universes.push(universe);
            saveFile();
            RestartService();
            returnStatus = "success";
        }
        else
        {
            returnStatus = "invalid-universe-number";
        }
    }
    else
    {
        returnStatus = "invalid-universe-value";
    }
    
    return returnStatus;
}

function DeleteUniverse(universe)
{
    let univIndex = Universes.indexOf(universe);
    let returnStatus = "";
    
    if (univIndex > -1)
    {
        Universes.splice(univIndex, 1);
        saveFile();
        RestartService();
        returnStatus = "success";
    }
    else
    {
        returnStatus = "not-found";
    }
    
    return returnStatus;
}

function GetFixtures()
{    
    return Fixtures;
}

function GetFixture(fixtureID)
{
    let fixtureObj = Fixtures.find(o => o.id === fixtureID);
    
    if (fixtureObj === undefined)
    {
        fixtureObj = null;
    }
    
    return fixtureObj;
}

function AddFixture(fixtureObj)
{
    let newFixtureObj = {};
    
    newFixtureObj.id = "fixture-" + uuidv4();
    newFixtureObj.name = fixtureObj.name;
    newFixtureObj.universe = parseInt(fixtureObj.universe);
    newFixtureObj.address = parseInt(fixtureObj.address);
    newFixtureObj.triggerValue = parseInt(fixtureObj.triggerValue);
    newFixtureObj.actionType = fixtureObj.actionType;
    newFixtureObj.action = fixtureObj.action;
    
    Fixtures.push(newFixtureObj);
    
    saveFile();
    
    return newFixtureObj;
}

function UpdateFixture(fixtureID, fixtureObj)
{
    let updatedFixtureObj = Fixtures.find((o, i) => {
        if (o.id === fixtureID)
        {
            Fixtures[i].name = fixtureObj.name;
            Fixtures[i].universe = parseInt(fixtureObj.universe);
            Fixtures[i].address = parseInt(fixtureObj.address);
            Fixtures[i].triggerValue = parseInt(fixtureObj.triggerValue);
            Fixtures[i].actionType = fixtureObj.actionType;
            Fixtures[i].action = fixtureObj.action;
            return true; // stop searching
        }
    });
    
    saveFile();
    
    return updatedFixtureObj;
}

function DeleteFixture(fixtureID)
{   
    let spliceIndex = null;
    
    for (let i = 0; i < Fixtures.length; i++)
    {
        if (Fixtures[i].id === fixtureID)
        {
            spliceIndex = i;
            break;
        }
    }
    
    if (spliceIndex !== null)
    {
        Fixtures.splice(spliceIndex, 1);
    }
    
    saveFile();
}

http_server.listen(listenPort, function () {
    console.log("listening on *:" + listenPort);
});

StartService();

function StartService()
{
    loadFile(); //loads the last saved set of data
    server = new e131.Server(Universes);
    
    server.on('listening', function() {
        console.log('server listening on port %d, universes %j', this.port, this.universes);
    });

    server.on('packet', function (packet) {
      var sourceName = packet.getSourceName();
      var sequenceNumber = packet.getSequenceNumber();
      var universe = packet.getUniverse();
      var slotsData = packet.getSlotsData();

        for (var i=0; i  < slotsData.length; i++)
        {
            let address = i + 1;
            CheckFixture(universe, address, slotsData[i]);
        }
    });
}

function RestartService()
{
    server.close();
    server = null;
    StartService();
}

function CheckFixture(universe, address, value)
{
    for (let i = 0; i < Fixtures.length; i++)
    {
        if (Fixtures[i].universe === universe)
        {
            if (Fixtures[i].address === address)
            {
                if (Fixtures[i].triggerValue === value)
                {
                    if (Fixtures[i].lastValue)
                    {
                        if (Fixtures[i].lastValue !== value)
                        {
                            //we only want to run the trigger when the value changes
                            console.log("Running trigger for " + Fixtures[i].id);
                            RunTrigger(Fixtures[i]);
                        }
                    }
                }
                Fixtures[i].lastValue = value;
            }
        }
    }
}

function RunTrigger(fixtureObj)
{
    switch(fixtureObj.actionType)
    {
        case "HTTP":
            RunHTTP(fixtureObj.action);
            break;
        default:
            break;
    }
}

function RunHTTP(url)
{ 
    if (url !== "")
    {
        if (!(url.includes("http://")) || (url.includes("https://")))
        {
            url = "http://" + url;
        }
        http.get(url).on("error", function (){console.log("GET request error");});
    }
}