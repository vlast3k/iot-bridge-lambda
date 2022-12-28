const ttt = require('@tuya/tuya-connector-nodejs')
const ewelink = require('ewelink-api');
const bbt = require('beebotte');
const fetch = require("node-fetch")
const fs = require('fs');

var secrets = JSON.parse(fs.readFileSync("secrets.json"))

var devices = {
    sofia_parno_detska : {
        id: "bf8218f2c5a50bbd9adwlv", 
        type: "tuya",
        fields: {
            temp:    { field: "temp_current", bbtype: "temperature", tuyafactor: 10},
            battery: { field: "battery_percentage", bbtype: "percentage", tuyafactor: 1},
        }
    },
    sofia_parno_hol : {
        id: "bfb321eae1c6e8e7e2gjtf",
        type: "tuya",
        fields: {
            temp:    { field: "temp_current", bbtype: "temperature", tuyafactor: 10},
            battery: { field: "battery_percentage", bbtype: "percentage", tuyafactor: 1},
        }
    },
    boikovec_bungalo_th16: {
        id: "1000084c06",
        type: "sonoff_ths",
        fields: {
            temp: { bbtype: "temperature" }
        }
    },
    boikovec_outside: {
        id: "bff8944a0009b6c7fdjssl",
        type: "tuya",
        fields: {
            temp:    { field: "va_temperature", bbtype: "temperature",tuyafactor: 10},
            hum:     { field: "va_humidity", bbtype: "percentage", tuyafactor: 1},
            battery: { field: "battery_percentage", bbtype: "percentage",tuyafactor: 1},
        }
    }, 
    boikovec_spalnia_adax: {
        type: "adax",
        fields: {
            temp: {bbtype:"temperature"}
        }
    }
}


var vendorHandlers = {
    "tuya" : tuyaGetDeviceField,
    "sonoff_ths": ewelinkGetDeviceField,
    "adax": adaxGetTemperature
}
 
var bclient = new bbt.Connector({token: secrets.bbt.iam_token});

const tuya = new ttt.TuyaContext({
  baseUrl: 'https://openapi.tuyaeu.com',
  accessKey: secrets.tuya.accessKey,
  secretKey: secrets.tuya.secretKey,
});

const ewelink1 = new ewelink({
    email: secrets.ewelink.email,
    password: secrets.ewelink.password,
    region: 'us',
  });


async function publishAllData(channel) {
    var ad = Object.keys(devices);
    for (var i = 0; i < ad.length; i++) {
        var name = ad[i];
        var af = Object.keys(devices[name].fields);
        for (var j=0; j < af.length; j++) {
            var field = af[j];
            console.log("--------- Processing: " + resourceName(name, field));
            await beebotteEnsureResourceExist(channel, resourceName(name, field), devices[name].fields[field].bbtype)
            await publishToBeebotte(channel, name, field)
            
        }
    }
} 

async function beebotteEnsureResourceExist(channel, resource_name, bbtype) {
    await new Promise((resolve) => {
        bclient.addResource({  channel: channel, 
                              resource: {name: resource_name, label: resource_name, vtype: bbtype}}, 
        function (err, res)  {
            handleBeebotteExistCallback(err, res, resource_name)
            resolve()
        })
    })
}

async function publishToBeebotte(channel, sensor_name, field_name) {
    var value;
    try {
        value = await vendorHandlers[devices[sensor_name].type](sensor_name, field_name)
        if (!value) throw "value is null!"
    } catch (e) {
        console.log(e)
        return;
    }

    var p = new Promise(resolve => {
        bclient.write(
            {channel: channel, resource: resourceName(sensor_name, field_name), data: value},
            function(err, res) {
                if(err) console.log("Publishing error " + resourceName(sensor_name, field_name) + " " + err); 
                else console.log("Publishing " + resourceName(sensor_name, field_name) + " " + value);
                resolve();
            });
        });
    await p;
}

function handleBeebotteExistCallback(err, res, resource_name) {
    if (err) {
        if (JSON.parse(err).error.code != 1304) {
            console.log(resource_name + " " + err )
        } else {
            console.log(resource_name + "  exists")
        }
    } else {
        console.log(resource_name + " " + res)
    } 
}

async function ewelinkGetDeviceField(device_name, field_name) {
    var status = await ewelink1.getDevice(devices[device_name].id);
    console.log(JSON.stringify(status))
    if (!status.online) return;
    var result = await ewelink1.getDeviceCurrentTemperature(devices[device_name].id)
    console.log(JSON.stringify(result))
    if (result.status == "ok") {
        return +result.temperature
    }
}

async function tuyaGetDeviceField(device_name, field_name) {
    var result = await tuya.deviceStatus.status({ device_id: devices[device_name].id  });
    return getTuyaValue(result.result, 
                    devices[device_name].fields[field_name].field, 
                    devices[device_name].fields[field_name].tuyafactor)
}

function getTuyaValue(array, field, tuyafactor) {
    var f = array.find(x => x.code == field)
    if (f) {
      return f.value / tuyafactor
    } else {
        return undefined;
    }
}

async function adaxGetTemperature() {
    var tokenRequest = await fetch(`https://api-1.adax.no/client-api/auth/token?grant_type=password&username=${secrets.adax.user}&password=${secrets.adax.pass}`, 
                                    {method: 'POST'});
    var tokenResponse = await tokenRequest.json();
    console.log(JSON.stringify(tokenResponse))
    var contentRequest =await fetch('https://api-1.adax.no/client-api/rest/v1/content/', 
                        {headers:{"Authorization": "Bearer " + tokenResponse.access_token}})
    var contentResponse = await contentRequest.text()
    console.log(contentResponse)
    var content =JSON.parse(contentResponse)
    return content.rooms[0].temperature / 100
}


function resourceName(sensor_name, field_name) {
    return sensor_name + "_" + field_name;
}


publishAllData("Boikovec")

exports.handler = async (event) => {
    console.log("aaa");
    await publishAllData("Boikovec")
    // TODO implement
    const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
    };
    return response;
};
