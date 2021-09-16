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
var CurrentData = []; //array of what the lights on the network are currently doing
var Captures = []; //array of lighting values from a capture point in time

var ActiveCue = null; //currently running cue

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
	//gets all Universe objects
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

	if (fixtureObj === null) {
		//return as invalid
		res.send({returnStatus: "invalid-fixture-id"});
	}
	else {
		res.send({returnStatus: "success", fixture: fixtureObj});
	}
});

app.post('/api/fixture/add', function (req, res) {
	//add the new fixture object into the array
	let fixtureObj = AddFixture(req.body);
	if (fixtureObj !== null) {
		res.send({returnStatus: "success", fixture: fixtureObj});
	}
});

app.post('/api/fixture/update/:fixtureid', function (req, res) {
	//updates the fixture object that already exists in the array
	let fixtureID = req.params.fixtureid;
	let fixtureObj = UpdateFixture(fixtureID, req.body);

	if (fixtureObj !== null) {
		res.send({returnStatus: "success", fixture: fixtureObj});
	}
});
 
app.get('/api/fixture/delete/:fixtureid', function (req, res) {
	//updates the fixture object that already exists in the array
	let fixtureID = req.params.fixtureid;
	DeleteFixture(fixtureID);

	res.send({returnStatus: "success"});
});

app.get('/api/capture/:cuenumber', function (req, res) {
	//captures everything on the sACN network for recalling later
	let cueNumber = req.params.cuenumber;
	CaptureData(cueNumber);

	res.send({returnStatus: "capture-success"});
});

app.get('/api/recall/:cuenumber', function (req, res) {
	//recall a cue
	let cueNumber = req.params.cuenumber;
	ActiveCue = cueNumber;
	Recall();

	res.send({returnStatus: "recall-success"});
});

 app.get('/api/clear', function (req, res) {
	//clears the active cue
	ActiveCue = null;
	Recall();

	res.send({returnStatus: "clear-success"});
});
 
function loadFile() { //loads settings on first load of app
	let rawdata = fs.readFileSync(JSONdatafile);
	let myJson = JSON.parse(rawdata); 

	if (myJson.Fixtures) {
		Fixtures = myJson.Fixtures;
	}

	if (myJson.Universes) {
		Universes = myJson.Universes;
	}

	if (Universes.length === 0) {
		Universes.push(1);
	}

	if (myJson.Captures) {
		Captures = myJson.Captures;
	}
}

function saveFile() { //saves settings to a local storage file for later recalling on restarts, etc.
	let myJson = {
		Fixtures: Fixtures,
		Universes: Universes,
		Captures: Captures
	};

	fs.writeFileSync(JSONdatafile, JSON.stringify(myJson, null, 1), "utf8", function(error) {
		if (error) { 
			console.log('Error writing file: ' + error);
		}
	});
}

function uuidv4() { //unique UUID generator for IDs
	return 'xxxxxxxx'.replace(/[xy]/g, function(c) {
	let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
	return v.toString(16);
	});
}

//Data Functions
function GetUniverses() {
	return Universes;
}

function AddUniverse(universe) {
	let returnStatus = "";

	if (Number.isInteger(universe)) {
		if ((universe > 0) && (universe <= 63999)) {
			Universes.push(universe);
			saveFile();
			RestartService();
			returnStatus = "success";
		}
		else {
			returnStatus = "invalid-universe-number";
		}
	}
	else {
		returnStatus = "invalid-universe-value";
	}

	return returnStatus;
}

function DeleteUniverse(universe) {
	let univIndex = Universes.indexOf(universe);
	let returnStatus = "";

	if (univIndex > -1) {
		Universes.splice(univIndex, 1);
		saveFile();
		RestartService();
		returnStatus = "success";
	}
	else {
		returnStatus = "not-found";
	}

	return returnStatus;
}

function GetFixtures() {
	return Fixtures;
}

function GetFixture(fixtureID) {
	let fixtureObj = Fixtures.find(o => o.id === fixtureID);

	if (fixtureObj === undefined) {
		fixtureObj = null;
	}

return fixtureObj;
}

function AddFixture(fixtureObj) {
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

function UpdateFixture(fixtureID, fixtureObj) {
	let updatedFixtureObj = Fixtures.find((o, i) => {
		if (o.id === fixtureID) {
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

function DeleteFixture(fixtureID) {
	let spliceIndex = null;

	for (let i = 0; i < Fixtures.length; i++) {
		if (Fixtures[i].id === fixtureID) {
			spliceIndex = i;
			break;
		}
	}

	if (spliceIndex !== null) {
		Fixtures.splice(spliceIndex, 1);
	}

	saveFile();
}

http_server.listen(listenPort, function () {
	console.log("UI available on port: " + listenPort);
});

StartService();

function StartService() {
	loadFile(); //loads the last saved set of data
	server = new e131.Server(Universes);

	server.on('listening', function() {
		console.log('Listening for sACN data on port %d, universes %j', this.port, this.universes);
	});

	server.on('packet', function (packet) {
		let sourceName = packet.getSourceName();
		let sequenceNumber = packet.getSequenceNumber();
		let universe = packet.getUniverse();
		let slotsData = packet.getSlotsData();

		for (let i = 0; i < slotsData.length; i++) {
			let address = i + 1;
			SetCurrentData(universe, address, slotsData[i]);
			CheckFixture(universe, address, slotsData[i]);
		}
	});

	server.on('error', function(error) {
		console.log('Error: ' + error);
	});
}

function RestartService() {
	server.close();
	server = null;
	StartService();
}

function SetCurrentData(universe, address, value) {
	if (Universes.includes(universe)) {
		//if we are currently monitoring/looking at this universe, otherwise ignore it
		let captureTime = Date.now();

		let universeFound = false;

		for (let i = 0; i < CurrentData.length; i++) {
			let addressFound = false;
			if (CurrentData[i].universe === universe) {
				universeFound = true;
				for (let j = 0; j < CurrentData[i].data.length; j++) {
					if (CurrentData[i].data[j].address === address) {
						addressFound = true;
						CurrentData[i].data[j].value = value;
					}
				}

				if (!addressFound) {
					let dataObj = {};
					dataObj.address = address;
					dataObj.value = value;
					CurrentData[i].data.push(dataObj);
				}
			}
		}

		if (!universeFound) {
			let dataObj = {};
			dataObj.universe = universe;
			dataObj.data = [ { address: address, value: value } ];
			CurrentData.push(dataObj);
		}
	}
}

function CheckFixture(universe, address, value) {
	for (let i = 0; i < Fixtures.length; i++) {
		if (Fixtures[i].universe === universe) {
			if (Fixtures[i].address === address) {
				if (Fixtures[i].triggerValue === value) {
					if (Fixtures[i].lastValue) {
						if (Fixtures[i].lastValue !== value) {
							//we only want to run the trigger when the value changes
							RunTrigger(Fixtures[i]);
						}
					}
				}
				Fixtures[i].lastValue = value;
			}
		}
	}
}

function RunTrigger(fixtureObj) {
	switch(fixtureObj.actionType) {
		case "HTTP":
			RunHTTP(fixtureObj.action);
			break;
		default:
			break;
	}
}

function RunHTTP(url) { 
	if (url !== "") {
		if (!(url.includes("http://")) || (url.includes("https://"))) {
			url = "http://" + url;
		}
		http.get(url).on("error", function (){console.log("GET request error");});
	}
}

function CaptureData(cueNumber) {
	let found = false;

	let captureObj = {};
	captureObj.cueNumber = cueNumber;
	captureObj.captureTime = Date.now();
	captureObj.data = CurrentData;

	for (let i = 0; i < Captures.length; i++) {
		if (Captures[i].cueNumber === captureObj.cueNumber) {
			found = true;
			Captures[i].captureTime = captureObj.captureTime;
			Captures[i].data = captureObj.data;
			//console.log('CAPTURED:');
			//console.log('Universe: ' + Captures[i].data[0].universe);
			//console.log('Data: ' + Captures[i].data[0].length);
			//console.log(Captures[i].data[0]);
		}
	}

	if (!found) {
		Captures.push(captureObj);
	}

	saveFile();
}

function Recall() {
	//Recalls the current ActiveCue; a global variable is used for this because the function runs on an interval

	if (ActiveCue !== null) {
		let captureObj = Captures.find( ({ cueNumber }) => cueNumber === ActiveCue );

		if (captureObj) {	
			let data = captureObj.data;
	
			for (let i = 0; i < data.length; i++) {
				//console.log('Universe: ' + data[i].universe);
				//console.log('Data: ' + data[i].data.length);
				//console.log(data[i].data);
				
				let recallClient = new e131.Client(data[i].universe);
				let packet = recallClient.createPacket(data[i].data.length); //define the packet based on number of addresses
				let slotsData = packet.getSlotsData();
				packet.setSourceName('sACN Translator');
				packet.setUniverse(data[i].universe);
	
				for (let k = 0; k < data[i].data.length; k++) {
					slotsData[k] = data[i].data[k].value % 0xff;
				}
				packet.setSlotsData(slotsData);
				recallClient.send(packet, function () {
					//do something after data is sent for this universe
				});
			}

			setTimeout(Recall, 125);
		}
		else {
			console.log('Cue Number not found to recall');
		}
	}
}