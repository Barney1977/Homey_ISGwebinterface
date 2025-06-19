 'use strict';

const Homey = require('homey');
const net = require('net');
const Modbus = require('jsmodbus');

const RETRY_INTERVAL = 60 * 1000;
const OPERATION_MODE_ADDRESS = 1500;
const TARGET_TEMPERATURE_ADDRESS = 1501;
const MEASURE_TEMPERATURE_ADDRESS = 583;
const TARGET_WATER_TEMP_ADDRESS = 1509;
const activeerLogging = false; // Zet deze op false om logging uit te schakelen

module.exports = class ModbusDevice extends Homey.Device {
  _modbusOptions = {
    host: this.getSetting('ip'),
    port: this.getSetting('port'),
    unitId: this.getSetting('id'),
    timeout: 5000,
    autoReconnect: true,
    logLabel: 'ISG modbus',
    logLevel: 'error',
    logEnabled: true,
  };

  async onInit() {
    this.log('Device init: ' + this.getName() + ' ID: ' + this.getData().id);

    this.log('Modbus settings:', this._modbusOptions);

    this.setWarning(this.homey.__("device.modbus.device_info"));

    this._settings = this.getSettings();
    this._settings.connection = this._settings.connection || "keep"; // Ensure connection setting is defined
    this._socketConnected = false;
    this._socket = new net.Socket();

    this.log('Socket settings:', {
      host: this._settings.ip,
      port: this._settings.port,
      unitID: this._settings.id,
    });

    this.homey.flow.getActionCard('adjust_heat_water_temperature')
      .registerRunListener(async (args) => {
        try {
          const newTemperature = args.Wished_temperature;
          await this.adjustHeatWaterTemperature(newTemperature);
          return true; // Geeft aan dat de actie succesvol was
        } catch (error) {
          this.log(error.message);
          return false; // Geeft aan dat de actie is mislukt
        }
      });
      this.homey.flow.getActionCard('set_operation_mode')
      .registerRunListener(async (args) => {
        try {
          const mode = args.operation_mode;
          await this.setOperationMode(mode);
          return true; // Geeft aan dat de actie succesvol was
        } catch (error) {
          this.log(error.message);
          return false; // Geeft aan dat de actie is mislukt
        }
      });
      this.homey.flow.getActionCard('adjust_heating_temperature')
    .registerRunListener(async (args) => {
      try {
        const newTemperature = args.Wished_temperature;
        await this.adjustHeatingTemperature(newTemperature);
        return true; // Geeft aan dat de actie succesvol was
      } catch (error) {
        this.log(error.message);
        return false; // Geeft aan dat de actie is mislukt
      }
    });

    
      // Register condition listeners
    this.homey.flow.getConditionCard('is_target_temperature')
    .registerRunListener(async (args) => {
      const currentTemperature = this.getCapabilityValue('target_temperature');
      return currentTemperature === args.target_temperature;
    });

  this.homey.flow.getConditionCard('is_Outside_temp')
    .registerRunListener(async (args) => {
      const currentTemperature = this.getCapabilityValue('measure_temperature.inputregister.1');
      return currentTemperature === args['measure_temperature.inputregister.1'];
    });

  this.homey.flow.getConditionCard('is_Actual_room_temperature')
    .registerRunListener(async (args) => {
      const currentTemperature = this.getCapabilityValue('measure_temperature.inputregister.2');
      return currentTemperature === args['measure_temperature.inputregister.2'];
    });

  this.homey.flow.getConditionCard('is_Hot_water_temperature')
    .registerRunListener(async (args) => {
      const currentTemperature = this.getCapabilityValue('measure_temperature.inputregister.3');
      return currentTemperature === args['measure_temperature.inputregister.3'];
    });

  this.homey.flow.getConditionCard('is_Actual_Flow_temp')
    .registerRunListener(async (args) => {
      const currentTemperature = this.getCapabilityValue('measure_temperature.inputregister.4');
      return currentTemperature === args['measure_temperature.inputregister.4'];
    });

  this.homey.flow.getConditionCard('is_Actual_retun_temp')
    .registerRunListener(async (args) => {
      const currentTemperature = this.getCapabilityValue('measure_temperature.inputregister.5');
      return currentTemperature === args['measure_temperature.inputregister.5'];
    });

  this.homey.flow.getConditionCard('is_requested_water_temp')
    .registerRunListener(async (args) => {
      const currentTemperature = this.getCapabilityValue('measure_temperature.inputregister.6');
      return currentTemperature === args['measure_temperature.inputregister.6'];
    });

  this.homey.flow.getConditionCard('is_Dew_point')
    .registerRunListener(async (args) => {
      const currentDewPoint = this.getCapabilityValue('measure_temperature.inputregister.7');
      return currentDewPoint === args['measure_temperature.inputregister.7'];
    });

  this.homey.flow.getConditionCard('is_pump_state')
    .registerRunListener(async (args) => {
      const currentState = this.getCapabilityValue('pump_state.inputregister.8');
      return currentState === args['pump_state.inputregister.8'];
    });

  this.homey.flow.getConditionCard('is_bron_pump')
    .registerRunListener(async (args) => {
      const currentState = this.getCapabilityValue('pump_state.inputregister.14');
      return currentState === args['pump_state.inputregister.14'];
    });

  this.homey.flow.getConditionCard('is_measure_pressure')
    .registerRunListener(async (args) => {
      const currentPressure = this.getCapabilityValue('measure_pressure.inputregister.9');
      return currentPressure === args['measure_pressure.inputregister.9'];
    });

  this.homey.flow.getConditionCard('is_measure_pressureII')
    .registerRunListener(async (args) => {
      const currentPressure = this.getCapabilityValue('measure_pressure.inputregister.10');
      return currentPressure === args['measure_pressure.inputregister.10'];
    });

  this.homey.flow.getConditionCard('is_powerconsumption_heating_water')
    .registerRunListener(async (args) => {
      const currentPower = this.getCapabilityValue('meter_power.inputregister.11');
      return currentPower === args['meter_power.inputregister.11'];
    });

  this.homey.flow.getConditionCard('is_powerconsumption_heating')
    .registerRunListener(async (args) => {
      const currentPower = this.getCapabilityValue('meter_power.inputregister.12');
      return currentPower === args['meter_power.inputregister.12'];
    });

  this.homey.flow.getConditionCard('is_Powerconsumption_today')
    .registerRunListener(async (args) => {
      const currentPower = this.getCapabilityValue('meter_power');
      return currentPower === args['meter_power'];
    });

    const option = {
      'host': this._settings.ip,
      'port': this._settings.port,
      'unitID': this._settings.id,
      'timeout': 5000,
      'autoReconnect': true,
      'logLabel': 'Stiebel Eltron ISG',
      'logLevel': 'error',
      'logEnabled': true
    };

    this.log('Option settings:', option);

    // Create a new Modbus TCP client using the socket and unitId
    this._client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);
    this._socket.setKeepAlive(true);
    this._socket.setMaxListeners(99);

    this._socket.on('end', () => {
      this.log("Socket ended.");
    });

    this._socket.on('connect', () => {
      this.log("Socket connected.");
      this._socketConnected = true; // Update socket connection status
    });

    this._socket.on('timeout', () => {
      this.log("Socket timeout.");
      this._socket.end();
      if (this._settings.connection === 'keep') {
        this.connectDevice().catch((error) => { this.log("Error reconnecting on socket.on('timeout'): ", error.message); });
      }
    });

    this._socket.on('error', (error) => {
      this.log("Socket error: ", error.message);
    });

    this._socket.on('close', (error) => {
      this.log("Socket closed.");
      this._socketConnected = false;
      if (this._settings.connection === 'keep') {
        this.connectDevice().catch((error) => { this.log("Error reconnecting on socket.on('close'): ", error.message); });
      }
    });

    // Connect to device
    // wait for slave device init
    await this.delay(2000);

    this.log(this._settings);
    this.log(this._settings.connection);

    if (this._settings.connection === 'keep' && this._socket) {
      this.log("KeepAlive option set. Reconnecting...");
      await this.connectDevice();
    } else {
      this.log("KeepAlive option not set. Don't reconnect.");
    }

    // Start the polling interval
    this.startPolling();

    // Register capability listener for target_temperature
    this.registerCapabilityListener('target_temperature', async (value) => {
      if (activeerLogging)this.log('Received change for target_temperature:', value);
      if (activeerLogging)this.log('Modbus register to write to is:', TARGET_TEMPERATURE_ADDRESS);

      const valueToWrite = Math.round(value * 10); // Scale factor 10
      if (activeerLogging)this.log(`Converted value to write (scaled): ${valueToWrite}`);

      if (valueToWrite < -32768 || valueToWrite > 32767) {
        this.error(`Value ${valueToWrite} is out of 16-bit integer range`);
        return;
      }

      if (activeerLogging)this.log(`Writing value ${valueToWrite} to target temperature register at address ${TARGET_TEMPERATURE_ADDRESS}`);

      try {
        const result = await this._client.writeSingleRegister(TARGET_TEMPERATURE_ADDRESS, valueToWrite);
        if (activeerLogging)this.log(`Successfully written value ${valueToWrite} to target temperature register ${TARGET_TEMPERATURE_ADDRESS}`);
        await this.updateTargetTemperature();
      } catch (error) {
        this.error(`Error writing to target temperature register: ${error.message}`);
        this.log(`Modbus Exception Response:`, error.response);
      }
    });

     // Register capability listener for Operation_mode
    this.registerCapabilityListener('Operation_mode', async (value) => {
      if (activeerLogging)this.log('Changes to Operation_mode:', value);
      if (activeerLogging)this.log('Modbus register to write to is:', OPERATION_MODE_ADDRESS);

      try {
        const currentRegister = await this._client.readHoldingRegisters(OPERATION_MODE_ADDRESS, 1);
        const currentValue = currentRegister.response._body.valuesAsBuffer.readUInt16BE(0);
        if (activeerLogging)this.log(`Current value in register ${OPERATION_MODE_ADDRESS} is: ${currentValue}`);
      } catch (error) {
        this.error(`Error reading current value from operation mode register: ${error.message}`);
        return;
      }

      const valueToWrite = parseInt(value, 10);
      if (activeerLogging)this.log(`Converted value to write: ${valueToWrite}`);

      if (activeerLogging)this.log(`Writing value ${valueToWrite} to operation mode register at address ${OPERATION_MODE_ADDRESS}`);

      try {
        const result = await this._client.writeSingleRegister(OPERATION_MODE_ADDRESS, valueToWrite);
        if (activeerLogging)this.log(`Successfully written value ${valueToWrite} to operation mode register ${OPERATION_MODE_ADDRESS}`);
      } catch (error) {
        this.error(`Error writing to operation mode register: ${error.message}`);
        this.log(`Modbus Exception Response:`, error.response);
      }
    });
  }

  async connectDevice() {
    if (!this._socket) {
      return;
    }
    return new Promise((resolve, reject) => {
      this.log('Device connect: ' + this.getName() + ' to IP ' + this._modbusOptions.host + ' port ' + this._modbusOptions.port + ' ID ' + this._modbusOptions.unitId);

      const errorHandler = (error) => {
        this._socket.removeListener("connect", connectHandler);
        reject(error);
      }

      const connectHandler = () => {
        this.log('Connected successfully.');
        this._socketConnected = true;
        this._socket.removeListener("error", errorHandler);
        resolve();
      }

      if (!this._socketConnected) {
        this._socket.once("error", errorHandler);
        this._socket.connect(this._modbusOptions.port, this._modbusOptions.host, connectHandler);
      } else {
        this.log("Already connected.");
        resolve();
      }
    });
  }

  async disconnectDevice() {
    if (!this._socket) {
      return;
    }
    return new Promise((resolve, reject) => {
      this.log('Device disconnected: ' + this.getName());

      const errorHandler = (error) => {
        this._socket.removeListener("close", disconnectHandler);
        reject(error);
      }

      const disconnectHandler = () => {
        this.log('Disconnected successfully.');
        this._socketConnected = false;
        this._socket.removeListener("error", errorHandler);
        resolve();
      }

      if (this._socketConnected) {
        this._socket.once("error", errorHandler);
        this._socket.end(disconnectHandler);
      } else {
        this.log("Not connected.");
        resolve();
      }
    });
  }

  async reconnectDevice() {
    this.log('Device reconnected: ' + this.getName());
    try {
      await this.disconnectDevice();
    } catch (error) { }

    if (this._settings.connection === 'keep' && this._socket) {
      this.log("KeepAlive option set. Reconnecting...");
      await this.connectDevice();
    } else {
      this.log("KeepAlive option not set. Don't reconnect.");
    }
  }

  getSocket() {
    return this._socket;
  }

  async onSettings({ newSettings, changedKeys }) {
    if (newSettings && (newSettings.ip || newSettings.port)) {
      try {
        this.log("IP address or port changed. Reconnecting...");
        this._modbusOptions.host = newSettings.ip;
        this._modbusOptions.port = newSettings.port;
        this._modbusOptions.unitId = newSettings.id;
        this._settings = newSettings;
        this.log("KeepAlive option set. Reconnecting...");

        this._client = new Modbus.client.TCP(this._socket, this._modbusOptions.unitId);
        try {
          await this.disconnectDevice();
        } catch (error) {
          this.log("Error disconnecting: ", error.message);
        }
        if (newSettings.connection === 'keep') {
          await this.connectDevice();
          this.log('Reconnected successfully.');
        } else {
          this.log("KeepAlive option not set. Don't reconnect.");
        }

      } catch (error) {
        this.log('Error reconnecting: ', error.message);
        throw error;
      }
    }
  }

  async updateOperationMode() {
    try {
      const result = await this._client.readHoldingRegisters(OPERATION_MODE_ADDRESS, 1);
      const currentValue = result.response._body.valuesAsBuffer.readUInt16BE(0);
      if (activeerLogging)this.log(`Polled value from register ${OPERATION_MODE_ADDRESS} is: ${currentValue}`);

      const currentCapabilityValue = this.getCapabilityValue('Operation_mode');
      if (currentCapabilityValue !== currentValue.toString()) { // Convert to string
        if (activeerLogging)this.log(`Updating capability 'Operation_mode' to: ${currentValue}`);
        this.setCapabilityValue('Operation_mode', currentValue.toString());
      }
    } catch (error) {
      this.error(`Erif (activeerLogging)ror polling value from operation mode register: ${error.message}`);
    }
  }

  async updateTargetTemperature() {
    try {
      if (activeerLogging)this.log('Polling target_temperature from register:', TARGET_TEMPERATURE_ADDRESS);
      const result = await this._client.readHoldingRegisters(TARGET_TEMPERATURE_ADDRESS, 1); // Use fc03
      const currentValue = result.response._body.valuesAsBuffer.readUInt16BE(0) / 10; // Scale factor 10
      if (activeerLogging)this.log(`Polled value from register ${TARGET_TEMPERATURE_ADDRESS} is: ${currentValue}`);

      if (activeerLogging)this.log(`Updating capability 'target_temperature' with value: ${currentValue}`);

      const currentCapabilityValue = this.getCapabilityValue('target_temperature');
      if (currentCapabilityValue !== currentValue) {
        if (activeerLogging)this.log(`Updating capability 'target_temperature' to: ${currentValue}`);
        this.setCapabilityValue('target_temperature', currentValue);
      }
    } catch (error) {
      this.error(`Error polling value from target temperature register: ${error.message}`);
      this.error('Full error details:', error);
    }
  }

  async updateMeasureTemperature() {
    try {
      if (activeerLogging)this.log('Polling measure_temperature from register:', MEASURE_TEMPERATURE_ADDRESS);
      const result = await this._client.readInputRegisters(MEASURE_TEMPERATURE_ADDRESS, 1); // Use fc04
      const currentValue = result.response._body.valuesAsBuffer.readUInt16BE(0) / 10; // Apply scale factor 10
      if (activeerLogging)this.log(`Polled value from register ${MEASURE_TEMPERATURE_ADDRESS} is: ${currentValue}`);

      const currentCapabilityValue = this.getCapabilityValue('measure_temperature');
      if (currentCapabilityValue !== currentValue) {
        if (activeerLogging)this.log(`Updating capability 'measure_temperature' to: ${currentValue}`);
        this.setCapabilityValue('measure_temperature', currentValue);
      }
    } catch (error) {
      this.error(`Error polling value from measure temperature register: ${error.message}`);
      this.error('Full error details:', error);
    }
  }

  async updatePumpState(registerName) {
    try {
      const { address, scale } = this.getCapabilityOptions(registerName);
      if (activeerLogging) this.log(`Polling ${registerName} from register:`, address);
      const result = await this._client.readInputRegisters(address, 1); // Use fc04
      const rawValue = result.response._body.valuesAsBuffer.readUInt16BE(0); // Read value from register
      if (activeerLogging) this.log(`Raw value from register ${address} is: ${rawValue}`);
  
      let valueToSet;
      if (registerName.startsWith('pump_state') && !registerName.includes('II')) {
        valueToSet = rawValue !== 0; // Convert to boolean for pump_state
      } else if (registerName.startsWith('pump_stateII')) {
        valueToSet = rawValue / scale; // Apply scalefactor for pump_stateII
      } else {
        throw new Error(`Unknown register name: ${registerName}`);
      }
  
      if (activeerLogging) this.log(`Processed value for ${registerName} is: ${valueToSet}`);
  
      const currentCapabilityValue = this.getCapabilityValue(registerName);
      if (currentCapabilityValue !== valueToSet) {
        if (activeerLogging) this.log(`Updating capability '${registerName}' to: ${valueToSet}`);
        this.setCapabilityValue(registerName, valueToSet);
      }
    } catch (error) {
      this.error(`Error polling value from ${registerName} register: ${error.message}`);
    }
  }
  async updatePressure(capability) {
    try {
      const { address, scale } = this.getCapabilityOptions(capability);
      if (activeerLogging)this.log(`Polling ${capability} from register:`, address);
      const result = await this._client.readInputRegisters(address, 1); // Use fc04
      let currentValue = result.response._body.valuesAsBuffer.readUInt16BE(0); // Read value from register
      if (activeerLogging)this.log(`Raw value for ${capability} from register: ${currentValue}`); // Log raw value
      currentValue = currentValue / scale; // Apply scale factor
      if (activeerLogging)this.log(`Converted value for ${capability}: ${currentValue}`);

      await this.delay(1000);

      const currentCapabilityValue = this.getCapabilityValue(capability);
      if (currentCapabilityValue !== currentValue) {
        if (activeerLogging)this.log(`Updating capability '${capability}' to: ${currentValue}`);
        this.setCapabilityValue(capability, currentValue);
      }
    } catch (error) {
      this.error(`Error polling value from ${capability} register: ${error.message}`);
    }
  }

  async adjustHeatingTemperature(newTemperature) {
    if (newTemperature < 10 || newTemperature > 30) {
      throw new Error("Temperature must be between 10 and 30 degrees.");
    }
  
    if (activeerLogging) this.log('Requested new heating temperature:', newTemperature);
    if (activeerLogging) this.log('Modbus register to write to is:', TARGET_TEMPERATURE_ADDRESS);
  
    const valueToWrite = Math.round(newTemperature * 10); // Scale factor 10
    if (activeerLogging) this.log(`Converted value to write (scaled): ${valueToWrite}`);
  
    if (valueToWrite < -32768 || valueToWrite > 32767) {
      this.error(`Value ${valueToWrite} is out of 16-bit integer range`);
      return;
    }
  
    if (activeerLogging) this.log(`Writing value ${valueToWrite} to target temperature register at address ${TARGET_TEMPERATURE_ADDRESS}`);
  
    try {
      const result = await this._client.writeSingleRegister(TARGET_TEMPERATURE_ADDRESS, valueToWrite);
      if (activeerLogging) this.log(`Successfully written value ${valueToWrite} to target temperature register ${TARGET_TEMPERATURE_ADDRESS}`);
      await this.updateTargetTemperature();
    } catch (error) {
      this.error(`Error writing to target temperature register: ${error.message}`);
      this.log(`Modbus Exception Response:`, error.response);
    }
  }async setOperationMode(newMode) {
    if (activeerLogging) this.log('Requested new operation mode:', newMode);
    if (activeerLogging) this.log('Modbus register to write to is:', OPERATION_MODE_ADDRESS);
  
    try {
      // Lees de huidige waarde van het holding register
      const currentRegister = await this._client.readHoldingRegisters(OPERATION_MODE_ADDRESS, 1);
      const currentValue = currentRegister.response._body.valuesAsBuffer.readUInt16BE(0);
      if (activeerLogging) this.log(`Current value in register ${OPERATION_MODE_ADDRESS} is: ${currentValue}`);
    } catch (error) {
      this.error(`Error reading current value from operation mode register: ${error.message}`);
      return;
    }
  
    // Converteer de nieuwe modus naar een 16-bits integer
    const valueToWrite = parseInt(newMode, 10);
    if (activeerLogging) this.log(`Converted value to write: ${valueToWrite}`);
  
    if (activeerLogging) this.log(`Writing value ${valueToWrite} to operation mode register at address ${OPERATION_MODE_ADDRESS}`);
  
    try {
      // Schrijf de nieuwe waarde naar het Modbus register met functiecode 06
      const result = await this._client.writeSingleRegister(OPERATION_MODE_ADDRESS, valueToWrite);
      if (activeerLogging) this.log(`Successfully written value ${valueToWrite} to operation mode register ${OPERATION_MODE_ADDRESS}`);
    } catch (error) {
      this.error(`Error writing to operation mode register: ${error.message}`);
      this.log(`Modbus Exception Response:`, error.response);
    }
  }
  async updateMeterPower() {
    try {
      const register11 = this.getCapabilityOptions('meter_power.inputregister.11');
      const register12 = this.getCapabilityOptions('meter_power.inputregister.12');

      if (activeerLogging)this.log('Polling meter_power.inputregister.11 from register:', register11.address);
      if (activeerLogging)this.log('Polling meter_power.inputregister.12 from register:', register12.address);

      const result11 = await this._client.readInputRegisters(register11.address, 1); // Use fc04
      const result12 = await this._client.readInputRegisters(register12.address, 1); // Use fc04

      const currentValue11 = result11.response._body.valuesAsBuffer.readUInt16BE(0) / register11.scale; // Apply scale factor
      const currentValue12 = result12.response._body.valuesAsBuffer.readUInt16BE(0) / register12.scale; // Apply scale factor

      if (activeerLogging)this.log(`Raw value for meter_power.inputregister.11 from register: ${result11.response._body.valuesAsBuffer.readUInt16BE(0)}`);
      if (activeerLogging) this.log(`Raw value for meter_power.inputregister.12 from register: ${result12.response._body.valuesAsBuffer.readUInt16BE(0)}`);
      if (activeerLogging)this.log(`Converted value for meter_power.inputregister.11: ${currentValue11}`);
      if (activeerLogging)this.log(`Converted value for meter_power.inputregister.12: ${currentValue12}`);

      const combinedValue = currentValue11 + currentValue12;
      if (activeerLogging)this.log(`Combined value for meter_power: ${combinedValue}`);

      const currentCapabilityValue = this.getCapabilityValue('meter_power');
      if (currentCapabilityValue !== combinedValue) {
        if (activeerLogging)this.log(`Updating capability 'meter_power' to: ${combinedValue}`);
        this.setCapabilityValue('meter_power', combinedValue);
      }
    } catch (error) {
      this.error(`Error polling values from meter_power registers: ${error.message}`);
    }
  }    
  async updateMeasurePower() {
    try {
      const register15 = this.getCapabilityOptions('measure_power.inputregister.15');
      const register16 = this.getCapabilityOptions('measure_power.inputregister.16');

      if (activeerLogging)this.log('Polling measure_power.inputregister.15 from register:', register15.address);
      if (activeerLogging)this.log('Polling measure_power.inputregister.16 from register:', register16.address);

      const result15 = await this._client.readInputRegisters(register15.address, 1); // Use fc04
      const result16 = await this._client.readInputRegisters(register16.address, 1); // Use fc04

      const currentValue15 = result15.response._body.valuesAsBuffer.readUInt16BE(0) / register15.scale; // Apply scale factor
      const currentValue16 = result16.response._body.valuesAsBuffer.readUInt16BE(0) / register16.scale; // Apply scale factor

      if (activeerLogging)this.log(`Raw value for measure_power.inputregister.15 from register: ${result15.response._body.valuesAsBuffer.readUInt16BE(0)}`);
      if (activeerLogging) this.log(`Raw value for measure_power.inputregister.16 from register: ${result16.response._body.valuesAsBuffer.readUInt16BE(0)}`);
      if (activeerLogging)this.log(`Converted value for measure_power.inputregister.15: ${currentValue15}`);
      if (activeerLogging)this.log(`Converted value for measure_power.inputregister.16: ${currentValue16}`);

      const combinedValue = currentValue15 + currentValue16;
      if (activeerLogging)this.log(`Combined value for measure_power: ${combinedValue}`);

      const currentCapabilityValue = this.getCapabilityValue('measure_power');
      if (currentCapabilityValue !== combinedValue) {
        if (activeerLogging)this.log(`Updating capability 'measure_power' to: ${combinedValue}`);
        this.setCapabilityValue('measure_power', combinedValue);
      }
    } catch (error) {
      this.error(`Error polling values from measure_power registers: ${error.message}`);
    }
  }    
    processOperationMode(operationModeValue) {
      const enumValues = this.getCapabilityOptions('Operation_mode').values;
      let enumValue = enumValues.find(value => value.id === operationModeValue)?.id;

      if (enumValue === undefined) {
        this.error('wrong operation mode value:', operationModeValue);
        return;
      }

      this.setCapabilityValue('Operation_mode', enumValue);
    }

    getCapabilityOptions(capability) {
      const driver = this.homey.drivers.getDriver('stiebel-heatpump');
      if (activeerLogging) this.log(`Getting capability options for ${capability}`);
      return driver.manifest.capabilitiesOptions[capability] || {};
    }

    startPolling() {
      const capabilities = [
        'measure_temperature.inputregister.1',
        'measure_temperature.inputregister.2',
        'measure_temperature.inputregister.3',
        'measure_temperature.inputregister.4',
        'measure_temperature.inputregister.5',
        'measure_temperature.inputregister.6',
        'measure_temperature.inputregister.7',
        'pump_state.inputregister.8',
        'pump_state.inputregister.14',
        'pump_stateII.inputregister.8',
        'pump_stateII.inputregister.14',
        'measure_pressure.inputregister.9',
        'measure_pressure.inputregister.10',
        'meter_power.inputregister.11',
        'meter_power.inputregister.12',
        'measure_power.inputregister.15',
        'measure_power.inputregister.16'
      ];
    
      // Double the polling interval
      this.pollingInterval = setInterval(async () => {
        await this.updateOperationMode();
        await this.updateTargetTemperature();
        await this.updateMeasureTemperature();
        await this.updatePumpState('pump_state.inputregister.8');
        await this.updatePumpState('pump_state.inputregister.14');
        await this.updatePumpState('pump_stateII.inputregister.8');
        await this.updatePumpState('pump_stateII.inputregister.14');
        await this.updatePressure('measure_pressure.inputregister.9');
        await this.updatePressure('measure_pressure.inputregister.10');
        await this.updateMeterPower('meter_power.inputregister.11');
        await this.updateMeterPower('meter_power.inputregister.12');
        await this.updateMeasurePower('measure_power.inputregister.15');
        await this.updateMeasurePower('measure_power.inputregister.16');
    
        setTimeout(() => {
          Promise.all(capabilities.map(capability => {
            const options = this.getCapabilityOptions(capability);
            return this._client.readInputRegisters(options.address, 1).then(result => {
              const value = capability.startsWith('pump_state') && !capability.includes('II')
                ? result.response._body._valuesAsBuffer.readInt16BE() !== 0 // Convert to boolean for pump_state
                : result.response._body._valuesAsBuffer.readInt16BE() / options.scale; // Apply scale factor for other capabilities
              this.setCapabilityValue(capability, value);
            });
          })).then(() => {
            this.log('All values updated');
          }).catch((error) => {
            this.log(error);
          });
        }, 10000); // Double the polling interval from 5000ms to 10000ms
      }, 10000);
    }

    onAdded() {
      this.log('device added: ', this.getData().id);
    }

    onDeleted() {
      this.log('device deleted:', this.getData().id);
      this._socket.end();
    }

    onUninit() {
      this.log('Uninit device: ', this.getData().id);
      this.disconnectDevice();
    }

    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

  ///////registerhandling en flows
  // REGISTER Handling ==============================================================================
 
 
 // Registreer de actiekaart
    

 async adjustHeatWaterTemperature(newTemperature) {
  if (newTemperature < 10 || newTemperature > 60) {
    throw new Error("Temperature must be between 10 and 60 degrees.");
  }

  if (activeerLogging)this.log('Requested new water temperature:', newTemperature);
  if (activeerLogging)this.log('Modbus register to write to is:', TARGET_WATER_TEMP_ADDRESS);

  try {
    // Lees de huidige waarde van het holding register
    const currentRegister = await this._client.readHoldingRegisters(TARGET_WATER_TEMP_ADDRESS, 1);
    const currentValue = currentRegister.response._body.valuesAsBuffer.readUInt16BE(0);
    if (activeerLogging)this.log(`Current value in register ${TARGET_WATER_TEMP_ADDRESS} is: ${currentValue}`);
  } catch (error) {
    this.error(`Error reading current value from water temperature register: ${error.message}`);
    return;
  }
  // Converteer de nieuwe temperatuur naar een 16-bits integer met schaalfactor 10
  const valueToWrite = Math.round(newTemperature * 10);
  if (activeerLogging)this.log(`Converted value to write (scaled): ${valueToWrite}`);

  if (activeerLogging)this.log(`Writing value ${valueToWrite} to water temperature register at address ${TARGET_WATER_TEMP_ADDRESS}`);

  try {
    // Schrijf de nieuwe waarde naar het Modbus register met functiecode 06
    const result = await this._client.writeSingleRegister(TARGET_WATER_TEMP_ADDRESS, valueToWrite);
    if (activeerLogging)this.log(`Successfully written value ${valueToWrite} to water temperature register ${TARGET_WATER_TEMP_ADDRESS}`);
  } catch (error) {
    this.error(`Error writing to water temperature register: ${error.message}`);
    this.log(`Modbus Exception Response:`, error.response);
  }
}
  };
