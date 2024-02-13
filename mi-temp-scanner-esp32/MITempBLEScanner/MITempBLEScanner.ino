#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <ArduinoJson.h>
#include <YAMLDuino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <TFT_eSPI.h>
#include <WiFiManager.h> // https://github.com/tzapu/WiFiManager

TFT_eSPI tft = TFT_eSPI(135, 240); // Invoke custom library

char CONFIG_SOFIA[] = "https://raw.githubusercontent.com/vlast3k/iot-bridge-lambda/main/config/config.yaml";
char CONFIG_BOIKOVEC[] = "https://raw.githubusercontent.com/vlast3k/iot-bridge-lambda/main/config/config_boikovec.yaml";
char CONFIG_TEMPLATE[] = "https://raw.githubusercontent.com/vlast3k/iot-bridge-lambda/main/config/%s.yaml";
char WIFI_BOIKOVEC[] = "vladiVivacom4g";
char CONFIG_LOCATION[200];

#define uS_TO_S_FACTOR 1000000  /* Conversion factor for micro seconds to seconds */
#define TIME_TO_SLEEP  5        /* Time ESP32 will go to sleep (in seconds) */

int scanTime = 20; // In seconds
BLEScan* pBLEScan;
JsonObject myConfig; // json accessor            
DynamicJsonDocument json_doc(2000);
char chipid[23];
int maxPayload = 30000;
int bootCount = 0;

String payload;

void openHTTPConnection() {
  WiFiClientSecure *client;
  Serial.printf("free mem %u\n", ESP.getFreeHeap());
  if (payload.length() == 0) return;
  //WiFiClientSecure *client;
  //HTTPClient https;
  client = new WiFiClientSecure;
  client ->setTimeout(10);
  client -> setHandshakeTimeout(3);
  client -> setInsecure();

  JsonObject jInflux =  myConfig["influx"].as<JsonObject>();
  Serial.printf("Influx, host: %s \n" , jInflux["host"].as<String>().c_str());
  Serial.printf("Influx, org: %s \n" , jInflux["org"].as<String>().c_str());
  String host   = jInflux["host"].as<String>();
  String token  = jInflux["token"].as<String>();
  String org    = jInflux["org"].as<String>();
  String bucket = jInflux["bucket"].as<String>();
  char fullHost[200];
  sprintf(fullHost, "%s?org=%s&bucket=%s&precision=s", host.c_str(), org.c_str(), bucket.c_str());

  //int res = https.begin(*client, fullHost);
  //https.addHeader("Authorization", token); 
  Serial.printf("Will call: %s\n", fullHost);
  //Serial.println(payload);
  Serial.println("-----------");

  Serial.printf("free mem %u\n", ESP.getFreeHeap());
  for (int i=0; i<4; i++) {
    Serial.println("connecting");
    if (!client->connect("us-east-1-1.aws.cloud2.influxdata.com", 443)) {
      Serial.println("Connection failed!");
    } else {
      break;
    }
    if (i == 3) {
      delete client;
      return;
    } 
  }

  //if (https.begin(*client, fullHost)) { 
    client->print("POST ");
    client->print(fullHost);
    client->println(" HTTP/1.1");
    client->println("Host: us-east-1-1.aws.cloud2.influxdata.com");
    client->print("Authorization: ");
    client->println(token);
    client->println("Connection: close");
    client->print("Content-length: ");
    client->println(payload.length());
    client->println();
  Serial.printf("free mem %u\n", ESP.getFreeHeap());

    Serial.println(token);
    //https.addHeader("Authorization", token); 
    // start connection and send HTTP header
    // int i=0;

    // for (; i + 3000 < payload.length(); i+=3000) {
    //   String s = payload.substring(i, i+3000);
    //   Serial.print(s);
    //   client->print(s);
    // }
    // String s = payload.substring(i);
    // Serial.println(s);
    // client->println(s);
    // Serial.println("---d-dd-d-");
    Serial.println(payload);
    client->println(payload);
    //payload.substring()
    //client->println();
    //client->println();
    while (client->connected()) {
      String line = client->readStringUntil('\n');
      Serial.println(line);
      //Serial.println("-=-");
      if (line == "\r") {
        Serial.println("headers received");
        break;
      }
    }
    // if there are incoming bytes available
    // from the server, read them and print them:
    while (client->available()) {
      char c = client->read();
      Serial.write(c);
    }

    client->stop();
    // int httpCode = https.POST(payload);
    // Serial.printf("[HTTPS] POST... code: %d\n", httpCode);

    // // httpCode will be negative on error
    // if (httpCode > 0) {
    //   Serial.printf("[HTTPS] GET... code: %d\n", httpCode);
    //   if (httpCode != HTTP_CODE_OK && httpCode != 204) {
    //     Serial.printf("[HTTPS] GET... failed, error: %s\n", https.errorToString(httpCode).c_str());
    //     tft.printf("err: %s\n", https.errorToString(httpCode).c_str());
    //   }
    // } else {

    // }
  
  
//  https.end();
  delete client;   
}

void sendResult(const char *sensorName, float temp, float hum, short batMv, short rssi) {
  JsonObject jInflux =  myConfig["influx"].as<JsonObject>();
  // Serial.printf("Influx, host: %s \n" , jInflux["host"].as<String>().c_str());
  // Serial.printf("Influx, org: %s \n" , jInflux["org"].as<String>().c_str());
  // String host   = jInflux["host"].as<String>();
  // String token  = jInflux["token"].as<String>();
  // String org    = jInflux["org"].as<String>();
  // String bucket = jInflux["bucket"].as<String>();
  JsonObject jSensors =  myConfig["sensors"].as<JsonObject>();
  JsonObject sensor =  jSensors[sensorName].as<JsonObject>();
  if (!sensor["tags"].as<String>().c_str()) {
    Serial.println(String("Sensor ") + sensorName + " not found");
    return;
  }
  // WiFiClientSecure *client = new WiFiClientSecure;
  // client ->setTimeout(10);
  // client -> setHandshakeTimeout(3);
  // client -> setInsecure();
  // HTTPClient https;
  char measurement[200];
  // const char* tags = sensor["tags"].as<String>().c_str();
  // const char* type = sensor["type"].as<String>().c_str();
  //sprintf(fullHost, "%s?org=%s&bucket=%s&precision=s", host.c_str(), org.c_str(), bucket.c_str());
  if (payload.length() > maxPayload) return;
  sprintf(measurement,  "temperature,%s,type=%s,id=%s,chipid=%s value=%f\n", sensor["tags"].as<String>().c_str(), sensor["type"].as<String>().c_str(), sensorName, chipid, temp);
  payload += measurement;
  sprintf(measurement,  "humidity,%s,type=%s,id=%s,chipid=%s value=%f\n", sensor["tags"].as<String>().c_str(), sensor["type"].as<String>().c_str(), sensorName, chipid, hum);
  payload += measurement;
  sprintf(measurement,  "batteryMv,%s,type=%s,id=%s,chipid=%s value=%d\n", sensor["tags"].as<String>().c_str(), sensor["type"].as<String>().c_str(), sensorName, chipid, batMv);
  payload += measurement;
  sprintf(measurement,  "rssi,%s,type=%s,id=%s,chipid=%s value=%d\n", sensor["tags"].as<String>().c_str(), sensor["type"].as<String>().c_str(), sensorName, chipid, rssi);
  payload += measurement;
  Serial.printf("free mem %u\n", ESP.getFreeHeap());
}

class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
      String name = String(advertisedDevice.getName().c_str());
      if (!name.startsWith("ATC")) return;
      Serial.printf("Advertised Device: %s - ", advertisedDevice.getName().c_str());
      tft.printf("%s:", advertisedDevice.getName().c_str());
      //name.startsWith("ATC");
      // Check if service data is available
      if (advertisedDevice.haveServiceData()) {
        // Get the service data
        uint8_t *d = (uint8_t*)advertisedDevice.getServiceData().data();
        int16_t *int16Value;
        uint16_t *uint16Value;
        //39D9 7538 C1A4 E802 8C18CC092C450E
//        39 D9 75 38 C1 A4 1B03 9F15CD092C9A0E
  //      0  1  2  3  4  5  6    8
        float temp = (float)*((int16_t*)(d+6));
        float hum =  (float)*((int16_t*)(d+8));
        uint16_t batMv = *((int16_t*)(d+10));
        Serial.printf("temp: %0.2f, hum: %0.2f%%, battery: %d mV, rssi: %d\n", temp/100, hum/100, batMv, advertisedDevice.getRSSI());
        tft.printf("%0.2f C, %d mV, %d db\n", temp/100, batMv, advertisedDevice.getRSSI());
        sendResult(advertisedDevice.getName().c_str(), temp/100, hum/100, batMv, advertisedDevice.getRSSI());
        // for (int i=0; i < advertisedDevice.getServiceDataCount(); i++) {
        // std::string serviceData = advertisedDevice.getServiceData();
        // uint8_t* serviceDataPtr = (uint8_t*)serviceData.data();
        // //   Serial.printf("Service Data: %d - ", i);
        //   for (int i = 0; i < serviceData.length(); i++) {
        //     Serial.printf("%02X", serviceDataPtr[i]);
        //   }
        //   Serial.println();
        // }
        // Get the service data UUID
        // for (int i=0; i < advertisedDevice.getServiceDataUUIDCount(); i++) {
        //   BLEUUID serviceDataUUID = advertisedDevice.getServiceDataUUID();
        //   Serial.printf("Service Data UUID: %d - %s", i, serviceDataUUID.toString().c_str());
        //   //serviceDataUUID.g
        //   //Serial.println(serviceDataUUID.toString().c_str());
        // }

        // Serial.print("Payload: " );
        // int len = advertisedDevice.getPayloadLength();
        // uint8_t *data = advertisedDevice.getPayload();
        // for (int i=0; i < len;) {
        //     uint8_t itemLen = data[i++];
        //     uint8_t itemType = data[i++];
        //     Serial.printf("Length: %02X, Type %02X\n", itemLen, itemType);
        //     for (int j=0; j<itemLen; j++) {
        //       Serial.printf("%02X", data[i++]);

        //     }
        //     /*                  temp hu%  batV
        //     1A18 141904 38C1A4 4D08 8518 910B 64 A3040
        //     1A18 39D975 38C1A4 E802 8C18 CC09 2C 450E0B094154435
        //          39D975 38C1A4 E802 8C18 CC09 2C 450E
        //     */
        //     // //uint8_t* aa = advertisedDevice.getPayload();
        //     // Serial.printf("%02X", advertisedDevice.getPayload()[i]);
        //   }
          
        

        // // Print the service data in HEX
        // Serial.print("Service Data: ");
        // for (int i = 0; i < serviceData.length(); i++) {
        //   Serial.printf("%02X", serviceDataPtr[i]);
        // }
      }
      //Serial.println();
    }
};


WiFiMulti WiFiMulti;
void setup() {
    tft.init();
    tft.setRotation(1);
    tft.fillScreen(TFT_BLACK);
    tft.setTextSize(2);
    tft.setTextColor(TFT_LIGHTGREY);
    tft.setCursor(0, 0);
    tft.setTextDatum(MC_DATUM);
    tft.setTextSize(1);


  bootCount ++;
  Serial.begin(115200);
  snprintf(chipid, 23, "%llX", ESP.getEfuseMac());
  Serial.printf("chip id: %s \n", chipid);
  WiFiManager wm;
      bool res;
    // res = wm.autoConnect(); // auto generated AP name from chipid
    // res = wm.autoConnect("AutoConnectAP"); // anonymous ap
    wm.setConnectTimeout(60);
    wm.setConfigPortalTimeout(300);
    res = wm.autoConnect("MITempGateway","password"); // password protected ap

    if(!res) {
        Serial.println("Failed to connect");
        ESP.restart();
    } 
    else {
        //if you get here you have connected to the WiFi    
        Serial.println("connected...yeey :)");
    }

  // WiFi.mode(WIFI_STA);
  // WiFiMulti.addAP("vladiVivacom4g", "0888414447");
  // WiFiMulti.addAP("vladiHome2", "0888414447");

  // //wait for WiFi connection
  // Serial.print("Waiting for WiFi to connect...");
  // tft.println("Connecting WiFi ...");
  // int attempts = 0;
  // while ((WiFiMulti.run() != WL_CONNECTED)) {
  //   Serial.print(".");
  //   if (attempts ++ > 20) ESP.restart();
  //   delay(500);
  // }
  Serial.printf(" connected to %s\n", WiFi.SSID());  
  tft.printf(" connected to %s\n", WiFi.SSID());  
  Serial.println("Scanning...");

  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan(); //create new scan
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true); //active scan uses more power, but get results faster
  pBLEScan->setInterval(4901);
  pBLEScan->setWindow(4900);  // less or equal setInterval value

  start();
}

void loop() {
  //Start the scan
  bootCount ++;
  payload = "";
  BLEScanResults foundDevices = pBLEScan->start(scanTime, false);
  Serial.print("Devices found: ");
  Serial.println(foundDevices.getCount());
  Serial.printf("free mem %u\n", ESP.getFreeHeap());
  tft.println("scan completed");
  pBLEScan->clearResults();  
  Serial.printf("free mem %u\n", ESP.getFreeHeap());
  openHTTPConnection();
  //Serial.println("Scan done!");

  // Clear the results from the last scan
  
  delay(300000);
  ESP.restart();
}

void start() {
  Serial.printf("Boot count = %d\n", bootCount);
    loadConfig();
    //JsonObject jInflux =  myConfig["influx"].as<JsonObject>();
    //Serial.printf("Influx, org1: %s \n" ,  jInflux["org"].as<String>().c_str());
    //Serial.printf("Influx, host: %s \n" , jInflux["host"].as<String>().c_str());
    //Serial.printf("Influx, org2: %s \n" ,  jInflux["token"].as<String>().c_str());
    //Serial.printf("Influx, org3: %s \n" ,  jInflux["bucket"].as<String>().c_str());
    //JsonObject jSensors =  myConfig["sensors"].as<JsonObject>();
    //JsonObject mysens =  jSensors["ATC_75D939"].as<JsonObject>();
    //Serial.printf("Influx, sens1org3: %s \n" ,  mysens["tags"].as<String>().c_str());
    // JsonObject json_obj = json_doc.to<JsonObject>();
    // String res;
    // serializeYml( json_obj, res);
    // Serial.println(res);
  
}

void loadConfig() {
  WiFiClientSecure *client = new WiFiClientSecure;
  if(client) {
    client -> setInsecure();
    client ->setTimeout(10);
   client -> setHandshakeTimeout(3);
  }
      HTTPClient https;
  
      Serial.print("Load Config\n");
      sprintf(CONFIG_LOCATION, CONFIG_TEMPLATE, WiFi.SSID());
      //char *config_location = CONFIG_SOFIA;
      //if (WiFi.SSID().equals(WIFI_BOIKOVEC)) config_location = CONFIG_BOIKOVEC;
      Serial.printf("Config Location: %s\n", CONFIG_LOCATION);
      if (https.begin(*client, CONFIG_LOCATION)) {  // HTTPS
        Serial.print("[HTTPS] GET...\n");
        // start connection and send HTTP header
        int httpCode = https.GET();
  
        // httpCode will be negative on error
        if (httpCode > 0) {
          // HTTP header has been send and Server response header has been handled
          Serial.printf("[HTTPS] GET... code: %d\n", httpCode);
  
          // file found at server
          if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY) {
            String payload = https.getString();
            Serial.println(payload);
            StringStream yaml_stream( payload );
            JsonObject json_obj = json_doc.to<JsonObject>();
            auto err = deserializeYml( json_obj, yaml_stream ); // deserialize yaml stream to JsonObject
            if( err ) {
              Serial.printf("Unable to deserialize demo YAML to JsonObject: %s", err.c_str() );
              https.end();
              delete client;  
              return;
            }
            myConfig = json_doc.as<JsonObject>();
          } else {
            Serial.printf("[HTTPS] GET... failed, error: %s\n", https.errorToString(httpCode).c_str());
            tft.printf("Could not load config: %s\n", https.errorToString(httpCode).c_str());
            delay(300000);
            ESP.restart();
          }
        }
      }
  
     https.end();
    delete client;  
        
}
