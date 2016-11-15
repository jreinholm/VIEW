var EventEmitter = require("events").EventEmitter;
var exec = require('child_process').exec;

var power = new EventEmitter();

power.lightDisabled = false;
power.gpsEnabled = null;
power.wifiEnabled = true;
power.autoOffMinutes = 10;
power.autoOffDisabled = false;

var powerControlBase = 0x17; // gps off, wifi off
var powerWifi = 0x40;
var powerGps = 0x8;

var powerDownTimerHandle = null;

power.init = function(disableLight) {
    exec("sudo i2cset -y -f 0 0x34 0x81 0xf9"); // fix issue with wifi power on
    exec("sudo i2cset -y -f 0 0x34 0x34 0x57"); // set chgled to blink
    exec("sudo i2cset -y -f 0 0x34 0x33 0xdc"); // set charge rate to 1.5A
    exec("sudo i2cset -y -f 0 0x34 0x30 0x60"); // set system current limit to 900mA

    if(disableLight) {
        power.lightDisabled = true;
        exec("sudo i2cset -y -f 0 0x34 0x32 0x8"); // disable chgled
    } else {
        power.lightDisabled = false;
        exec("sudo i2cset -y -f 0 0x34 0x32 0x0"); // enable chgled
    }
}

function setPower(callback) {
    var setting = powerControlBase;
    if(power.gpsEnabled) setting |= powerGps;
    if(power.wifiEnabled) setting |= powerWifi;
    exec("sudo i2cset -y -f 0 0x34 0x12 0x" + setting.toString(16), callback); // set power switches
}

power.setAutoOff = function(minutes) {
    if(powerDownTimerHandle) clearTimeout(powerDownTimerHandle);
    powerDownTimerHandle = null;
    power.autoOffMinutes = minutes;
    power.activity();
}

power.activity = function() {
    if(powerDownTimerHandle) clearTimeout(powerDownTimerHandle);
    powerDownTimerHandle = null;
    if(power.autoOffMinutes && !power.autoOffDisabled) {
        powerDownTimerHandle = setTimeout(function(){
            power.shutdown();
        }, power.autoOffMinutes * 60000);
    }
}
power.activity();

power.shutdown = function() {
    process.nextTick(function(){
        exec("nohup init 0;");
    });
}

power.disableAutoOff = function() {
    power.autoOffDisabled = true;
    power.activity();
}

power.enableAutoOff = function() {
    power.autoOffDisabled = false;
    power.activity();
}

power.gps = function(enable, callback) {
    power.gpsEnabled = enable;
    setPower(callback);
}

power.wifi = function(enable, callback) {
    power.wifiEnabled = enable;
    setPower(function(){
        setTimeout(callback, 3000); // give time for modules to load/unload
    });
}

power.update = function(noEvents) {
    exec('/bin/sh /home/view/current/bin/battery.sh', function(error, stdout, stderr) {
        var charging = null;
        var percentage = null;

        lines = stdout.split('\n');
        for(var i = 0; i < lines.length; i++) {
            if(lines[i].indexOf('CHARG_IND') === 0) {
                var matches = lines[i].match(/=([0,1])/i);
                if(matches.length > 1) {
                    charging = parseInt(matches[1]) > 0;
                    //console.log("battery charging:", charging);
                }
            }
            if(lines[i].indexOf('Battery gauge') === 0) {
                var matches = lines[i].match(/= ([0-9]+)/i);
                if(matches.length > 1) {
                    percentage = parseInt(matches[1]);
                    if(percentage > 100) percentage = 100;
                    //console.log("battery percentage:", percentage);
                }
            }
        }

        if(charging !== null && charging != power.charging) {
            power.charging = charging;
            power.emit("charging", charging);
        }

        if(percentage !== null && percentage != power.percentage) {
            power.percentage = percentage;
            power.emit("percentage", percentage);
        }

    });

};

setInterval(power.update, 5000);

module.exports = power;