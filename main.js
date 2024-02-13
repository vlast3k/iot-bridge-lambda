const ttt = require('@tuya/tuya-connector-nodejs')
const ewelink = require('ewelink-api');
const bbt = require('beebotte');
const fetch = require("node-fetch")
const fs = require('fs');
const { getHeapStatistics } = require('v8');

var secrets = JSON.parse(fs.readFileSync("secrets.json"))

var mitemp_template = {
    type: "esphome",
    fields: {
        temp: {bbtype:"temperature"},
        humidity:  {bbtype:"humidity"},
        voltage: {bbtype: "number"}

    }
};
var devices_Boikovec = {
    sofia_parno_detska : {
        id: "bf8218f2c5a50bbd9adwlv", 
        type: "tuya",
        influx_line: "sofia,room=detska,type=parno",
        fields: {
            temp:    { field: "temp_current", bbtype: "temperature", tuyafactor: 10},
            battery: { field: "battery_percentage", bbtype: "percentage", tuyafactor: 1},
        }
    },
    sofia_parno_hol : {
        id: "bfb321eae1c6e8e7e2gjtf",
        type: "tuya",
        influx_line: "sofia,room=hol,type=parno",
        fields: {
            temp:    { field: "temp_current", bbtype: "temperature", tuyafactor: 10},
            battery: { field: "battery_percentage", bbtype: "percentage", tuyafactor: 1},
        }
    },
    boikovec_hol_th16: {
        id: "10000dc3b6",
        type: "sonoff_ths",
        influx_line: "boikovec,room=hol,type=sonoff",
        fields: {
            temp: { bbtype: "temperature" }
        }
    },
    boikovec_bungalo_th16: {
        id: "1000084c06",
        type: "sonoff_ths",
        influx_line: "boikovec,room=bungalo,type=sonoff",
        fields: {
            temp: { bbtype: "temperature" }
        }
    },
    boikovec_outside: {
        id: "bff8944a0009b6c7fdjssl",
        type: "tuya",
        influx_line: "boikovec,room=outside,type=tuya",
        fields: {
            temp:    { field: "va_temperature", bbtype: "temperature",tuyafactor: 10},
            hum:     { field: "va_humidity", bbtype: "percentage", tuyafactor: 1},
            battery: { field: "battery_percentage", bbtype: "percentage",tuyafactor: 1},
        }
    }, 
    boikovec_spalnia_adax: {
        type: "adax",
        influx_line: "boikovec,room=spalnia,type=adax",
        fields: {
            temp: {bbtype:"temperature"}
        }
    },
    boikovec_si7021_1: {
        type: "esphome",
        fields: {
            temp: {bbtype:"temperature"},
            hum:  {bbtype:"humidity"}
        }
    }    ,
    boikovec_si7021_2: {
        type: "esphome",
        fields: {
            temp: {bbtype:"temperature"},
            hum:  {bbtype:"humidity"}
        }
    }
}

var devices_Sofia = {
    mitemp_28AB2C: mitemp_template,
    mitemp_041914: mitemp_template,
    mitemp_882E08: mitemp_template,
    mitemp_6E758F: mitemp_template,
    mitemp_632C7A: mitemp_template

}


var vendorHandlers = {
    "tuya" : tuyaGetDeviceField,
    "sonoff_ths": ewelinkGetDeviceField,
    "adax": adaxGetTemperature,
    "esphome": esphomeVoid
}


 
var bclient = new bbt.Connector({token: secrets.bbt.iam_token});

const tuya = new ttt.TuyaContext({
  baseUrl: 'https://openapi.tuyaeu.com',
  accessKey: secrets.tuya.accessKey,
  secretKey: secrets.tuya.secretKey,
});



async function publishAllData(channel) {
    var ad = Object.keys(devices);
    for (var i = 0; i < ad.length; i++) {
        var name = ad[i];
        var af = Object.keys(devices[name].fields);
        for (var j=0; j < af.length; j++) {
            var field = af[j];
            console.log("--------- Processing: " + resourceName(name, field));
            //await beebotteEnsureResourceExist(channel, resourceName(name, field), devices[name].fields[field].bbtype)
            await publish(channel, name, field)
            
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

async function publish(channel, sensor_name, field_name) {
    var value;
    try {
        value = await vendorHandlers[devices[sensor_name].type](sensor_name, field_name)
        if (!value) throw "value is null!"
    } catch (e) {
        console.log(e)
        return;
    }
    //await publishToBeebotte(channel, sensor_name, field_name, value)
    if (devices[sensor_name].influx_line) await publishToInflux(channel, sensor_name, field_name, value)
}

async function publishToInflux(channel, sensor_name, field_name, value) {

/*
  curl --request POST \
"https://us-east-1-1.aws.cloud2.influxdata.com/api/v2/write?org=iot&bucket=iot&precision=s" \
  --header "Authorization: Token b1B2mmbWp9wnaLJsFOiXna_IeS8PdanJq1MClHZoTOSWmzg8SyiZSkq6Rwx4tCNPcLezg74OJd8BXajwWnfiqQ==" \
  --header "Content-Type: text/plain; charset=utf-8" \
  --header "Accept: application/json" \
  --data-binary '
    airSensors,sensor_id=TLM0201,loc=bb temperature=73.97038159354763,humidity=35.23103248356096,co=0.48445310567793615
    airSensors,sensor_id=TLM0202,loc=xx temperature=75.30007505999716,humidity=35.651929918691714,co=0.5141876544505826
    '

*/    
    console.log(`${devices[sensor_name].influx_line} ${field_name}=${value}`);
    var response = await fetch('https://us-east-1-1.aws.cloud2.influxdata.com/api/v2/write?org=iot&bucket=iot&precision=s', 
      { method: "POST",
        headers: {
            "Authorization": "Token b1B2mmbWp9wnaLJsFOiXna_IeS8PdanJq1MClHZoTOSWmzg8SyiZSkq6Rwx4tCNPcLezg74OJd8BXajwWnfiqQ==",
            "Content-Type" : "text/plain; charset=utf-8" ,
            "Accept"       : "application/json"
        },
        body: `${devices[sensor_name].influx_line} ${field_name}=${value}`
        //body: `${channel},sensor=${sensor_name} ${field_name}=${value}`
    })
    console.log("response.ok=" + response.ok + ", data=" + await response.text())
}

async function publishToBeebotte(channel, sensor_name, field_name, value) {
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
    //var devices = await ewelink1.getDevices();
    for (let i=0; i < 3; i++) {
        var ewelink1 = new ewelink({
            email: secrets.ewelink.email,
            password: secrets.ewelink.password,
            region: 'us',
        });
        
        console.log("secrets.ewelink.email  secrets.ewelink.password")
        console.log(secrets.ewelink.email + " " + secrets.ewelink.password)
        var status = await ewelink1.getDevice(devices[device_name].id);
        // console.log(JSON.stringify(status))
        // status = await ewelink1.setDeviceAutoTemperatureState(devices[device_name].id, false)
        // console.log(JSON.stringify(status))
        // status = await ewelink1.setDeviceAutoTemperatureState(devices[device_name].id, true)
        console.log(JSON.stringify(status))
        // if (status.error == 406 ) continue;
        // if (!status.online) return;
        var result = await ewelink1.getDeviceCurrentTemperature(devices[device_name].id)
        console.log(JSON.stringify(result))
        if (result.status == "ok") {
            return +result.temperature
        }
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
    for (let i=0; i < 3; i++) {
        var tokenRequest = await fetch(`https://api-1.adax.no/client-api/auth/token?grant_type=password&username=${secrets.adax.user}&password=${secrets.adax.pass}`, 
                                        {method: 'POST'});
        var tokenResponse = await tokenRequest.json();
        console.log(JSON.stringify(tokenResponse))
        var response =await fetch('https://api-1.adax.no/client-api/rest/v1/content/', 
                            {headers:{"Authorization": "Bearer " + tokenResponse.access_token}})
        if (!response.ok) {
            console.log("status: " + response.status + ", text: " + response.statusText)
        } else {
            var contentResponse = await response.text()
            console.log(contentResponse)
        
            var content =JSON.parse(contentResponse)
            return content.rooms[0].temperature / 100
        }
    }
}

async function esphomeVoid() {
    
}

function resourceName(sensor_name, field_name) {
    return sensor_name + "_" + field_name;
}

var devices = devices_Boikovec;
publishAllData("Boikovec")
//devices = devices_Sofia;
//publishAllData("Sofia")

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

exports.helloWorld = async (req, res) => {
    await publishAllData("Boikovec")
    res.status(200).send("OK")
    // let message = req.query.message || req.body.message || 'Hello World!';
    // res.status(200).send(message);
  };
  
  exports.helloPubSub = async (event, context) => {
    await publishAllData("Boikovec")
    const message = event.data
      ? Buffer.from(event.data, 'base64').toString()
      : 'Hello, World';
    console.log(message);
  };
  