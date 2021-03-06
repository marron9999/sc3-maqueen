const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const log = require('../../util/log');
const cast = require('../../util/cast');
const formatMessage = require('format-message');
const BLE = require('../../io/ble');
const Base64Util = require('../../util/base64-util');

/**
 * Icon png to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAR8SURBVFhHzZV9TJVVHMcfHImC6aVZiN5ZbIraJm/eC7gg125mRMZyOcYfiSam4BYjGtHL2iojBJaFRVCC8gdEILVpAaaZK+RVUnKRUiZiyAW5vBRcE6Fvv3MeDpfLc1b/njs+u/d8ft/ze849z30OGgClkUqVkEqVkEqVkEqVkEqVkEqVkEqVkEqVkEqVkEqVkEqVkEqVkEqVkErB4NAA+gaG4KSBcEbGMdZrR+/YXzSU1RljGBnph91uR7/DQTP4S5IzIpWMm2c/QMyGUISERWFndg0GSIraTL55y4L1wRasDX8CRe2DpGbWB1CesxexMaEIXGFGVFQ0zA8EIGLTRiS/XoEbLO2WNyKVjEuFCZhPZY2xegtOdpM15K7jUZEhLHm/uzJDdUgN8eN+0YY0nP7xKrqvdaHjQjN2h/vrc+4Kwik2w62nO1LJ6CxOhO8ccXEz0j9vJ+2e6c226nUPD/6+bv9VPTPahKSwhdwFF9p1N4vfirdjHps7Nx4tJISfjVQy2AJNrIHZH970HphSilEqiDrbvdeC74bmORcrrBG4hzJhOdd4venQLixic72T/+P3a8erET60Ak9sO/gzKVnmfxa4gMpLkvLx0mq2i4/hmOMWlaYyHQVYOV+D55IgpLydBj/KhuZdp9KfOJiwlO9edGGnKy/jy2d47sG4d8H3XpIxCAFbINu5VRln8ENWFG9kK+mjkl5vzd0KL3KmR7JQczyN71jYez3ARA92rmRfKADZV4am81LaMnnfxQ89h0YHGUnGIARigQFvtONO20dYS581cyaVqD7+E9Jt+i4dGAYul+/gWb7AyR4kBeoLzPqVX1XDP6TvjIP+9LGgNYP38I18FvX9s2pTGIRALND88kU66lqRaJlHaR8cpaKz4UNY6fZqWjxu07jlsL5A/RYPIXez/oA8Xa7veOepUuyw2RDz1AvYX/U9ekeYput8t4fn/KJ3o0W4WRiEQCxwWXobDW/jyPPrebNNh/pwLudh/jlwXzPVoJ2dWmBIDjuLJvDVvo28riXU8XpPx0kU53+Cd2K9ubdsycYlhxNtqav4OHLXYdCN4NnZGIRgeoEv8kNAQ3MefL3ooVgUhXD+0KxDRfffvOZaoH7MONtKEWliGQ1F/JRx9S3Yo5+NPovvg4kdY54m5J5zz8xEKhmXP93Gzyn/tCYaMncTWWtMvDljQVwuBvlvahL1JYk8G5TtOqgvFqdgKc+akVFzAcOjTvZTpNcoqjOjp/vcn3qGSbdrz0QqGd2l27GQyuZXXGfU4GeP64097sXe0qapC06isSSZZyML9HNQ0F77MZ60LocHm7Pcgti4eKyx+mGO5gWrbTNsIct4v4Ctb6K5h3/b6bkCgxBM3jiP2i/KcKJzgobCd6GiohJHv62HfczVcLj7F9SWHUODnT0yrh4cZxcaTlTjSEkx8t8/gKKqanx9uhEDdILf+uM8qiorUXa8Dlcc/N+A+1zCIFRDKlVCKlVCKlVCKlVCKlVCKlVCKlVCKlVCKlVCKlVCKtUB2r+RgfiCjfNO0AAAAABJRU5ErkJggg==';

/**
 * Enum for micro:bit BLE command protocol.
 * https://github.com/LLK/scratch-microbit-firmware/blob/master/protocol.md
 * @readonly
 * @enum {number}
 */
const CMD = {
	MORTOR_LEFT: "ML",
	MORTOR_RIGHT: "MR",
	MORTOR_ALL: "MB",
	//MORTOR_SPEED: "MS",
	LED_LEFT: "LL",
	LED_RIGHT: "LR",
	LED_ALL: "LB",
	REQ_PATROL: "RS",
	REQ_DISTANCE: "RU",
	REQ_AUTO: "RA"
};

/**
 * Manage communication with a MicroBit peripheral over a Scrath Link client socket.
 */
class Maqueen {

	/**
	* Construct a MicroBit communication object.
	* @param {Runtime} runtime - the Scratch 3.0 runtime
	* @param {string} extensionId - the id of the extension
	*/
	constructor (runtime, extensionId) {

		/**
		* The Scratch 3.0 runtime used to trigger the green flag button.
		* @type {Runtime}
		* @private
		*/
		this._runtime = runtime;

		/**
		* The id of the extension this peripheral belongs to.
		*/
		this._extensionId = extensionId;

		if( this._runtime._mbitlink == undefined) {
			this._runtime._mbitlink = { instance: null, extensions: { maqueen : this } };
		} else {
			this._runtime._mbitlink.extensions.maqueen = this;
		}

		/**
		* The most recently received value for each sensor.
		* @type {Object.<string, number>}
		* @private
		*/
		this._sensors = {
			patrol: [0, 0],
			mortor: [0, 0],
			//speed: 0,
			led: [0, 0],
			distance: 0,
		};

		this.onMessage = this.onMessage.bind(this);
	}

	send (cmd, data) {
		if( this._runtime._mbitlink.instance != null) {
			this._runtime._mbitlink.instance.send(cmd + data + "\n"); 
		}
	}

	onMessage (data) {
		if(data[0] == 'S') {
			if(data[1] == 'L') {
				this._sensors.patrol[0] = parseInt(data.substr(2));
				return true;
			}
			if(data[1] == 'R') {
				this._sensors.patrol[1] = parseInt(data.substr(2));
				return true;
			}
			if(data[1] == 'B') {
				this._sensors.patrol[0] =
				this._sensors.patrol[1] = parseInt(data.substr(2));
				return true;
			}
			return true;
		}
		if(data[0] == 'L') {
			if(data[1] == 'L') {
				this._sensors.led[0] = parseInt(data.substr(2));
				return true;
			}
			if(data[1] == 'R') {
				this._sensors.led[1] = parseInt(data.substr(2));
				return true;
			}
			if(data[1] == 'B') {
				this._sensors.led[0] =
				this._sensors.led[1] = parseInt(data.substr(2));
				return true;
			}
			return true;
		}
		if(data[0] == 'M') {
			if(data[1] == 'L') {
				this._sensors.mortor[0] = parseInt(data.substr(2));
				return true;
			}
			if(data[1] == 'R') {
				this._sensors.mortor[1] = parseInt(data.substr(2));
				return true;
			}
			if(data[1] == 'B') {
				this._sensors.mortor[0] =
				this._sensors.mortor[1] = parseInt(data.substr(2));
				return true;
			}
			//if(data[1] == 'S') {
			//	this._sensors.speed = parseInt(data.substr(2));
			//	return true;
			//}
			return true;
		}
		if(data[0] == 'U') {
			this._sensors.distance = parseInt(data.substr(2));
			return true;
		}
		return false;
	}

	get mortor () {
		return this._sensors.mortor;
	}
	//get speed () {
	//	return this._sensors.speed;
	//}
	get led () {
		return this._sensors.led;
	}
	get patrol () {
		return this._sensors.patrol;
	}
	get distance () {
		return this._sensors.distance;
	}
}

const Maqueen_Side = {
	LEFT: 'left',
	RIGHT: 'right',
	ALL: 'all'
};
const Maqueen_LR = {
	LEFT: 'left',
	RIGHT: 'right'
};
const Maqueen_Switch = {
	ON: 'on',
	OFF: 'off'
};
const Maqueen_Enable = {
	ENABLE: 1,
	DISABLE: 0
};

/**
 * Scratch 3.0 blocks to interact with a MicroBit peripheral.
 */
class Scratch3_Maqueen_Blocks {

	/**
	* @return {string} - the name of this extension.
	*/
	static get EXTENSION_NAME () {
		return 'maqueen';
	}

	/**
	* @return {string} - the ID of this extension.
	*/
	static get EXTENSION_ID () {
		return 'maqueen';
	}

	get SIDE_ALL_MENU () {
		return [
			...this.SIDE_MENU,
			{
				text: formatMessage({
					id: 'maqueen.sideMenu.all',
					default: 'All',
					description: 'label for "all" element in side picker'
				}),
				value: Maqueen_Side.ALL
			}
		];
	}

	get SIDE_MENU () {
		return [
			{
				text: formatMessage({
					id: 'maqueen.sideMenu.left',
					default: 'Left',
					description: 'label for "left" element in side picker'
				}),
				value: Maqueen_Side.LEFT
			},
			{
				text: formatMessage({
					id: 'maqueen.sideMenu.right',
					default: 'Right',
					description: 'label for "right" element in side picker'
				}),
				value: Maqueen_Side.RIGHT
			}
		];
	}

	get SWITCH_MENU () {
		return [
			{
				text: formatMessage({
					id: 'maqueen.switchMenu.on',
					default: 'On',
					description: 'label for "on" element in switch picker'
				}),
				value: Maqueen_Switch.ON
			},
			{
				text: formatMessage({
					id: 'maqueen.switchMenu.off',
					default: 'Off',
					description: 'label for "on" element in switch picker'
				}),
				value: Maqueen_Switch.OFF
			}
		];
	}

	get ENABLE_MENU () {
		return [
			{
				text: formatMessage({
					id: 'maqueen.enableMenu.enable',
					default: 'Enable',
					description: 'label for enable picker'
				}),
				value: Maqueen_Enable.ENABLE
			},
			{
				text: formatMessage({
					id: 'maqueen.enableManu.disable',
					default: 'Disable',
					description: 'label for enable picker'
				}),
				value: Maqueen_Enable.DISABLE
			}
		];
	}

	/**
	* Construct a set of MicroBit blocks.
	* @param {Runtime} runtime - the Scratch 3.0 runtime.
	*/
	constructor (runtime) {
		/**
		* The Scratch 3.0 runtime.
		* @type {Runtime}
		*/
		this.runtime = runtime;

		// Create a new MicroBit peripheral instance
		this.instance = new Maqueen(this.runtime, Scratch3_Maqueen_Blocks.EXTENSION_ID);
	}

	/**
	* @returns {object} metadata for this extension and its blocks.
	*/
	getInfo () {
		this.setupTranslations();
		return {
			id: Scratch3_Maqueen_Blocks.EXTENSION_ID,
			name: Scratch3_Maqueen_Blocks.EXTENSION_NAME,
			//color1: '#0FBD8C',
			color1:   '#0F9D4C',
			//color2: '#0DA57A',
			color2:   '#0D853A',
			//color3: '#0B8E69',
			color3:   '#0B6E29',
			blockIconURI: blockIconURI,
			//showStatusButton: false,
			blocks: [
				{
					opcode: 'maqueenPatrolLeft',
					text: formatMessage({
						id: 'maqueen.PatrolLeft',
						default: 'Left patrol sensor (0-Black, 1-White)',
						description: 'status of Maqeen patrol left'
					}),
					blockType: BlockType.REPORTER
				},
				{
					opcode: 'maqueenPatrolRight',
					text: formatMessage({
						id: 'maqueen.PatrolRight',
						default: 'Right patrol sensor (0-Black, 1-White)',
						description: 'status of Maqeen patrol right'
					}),
					blockType: BlockType.REPORTER
				},
				{
					opcode: 'maqueenSetPatrol',
					text: formatMessage({
						id: 'maqueen.setPatrol',
						default: '[ENABLE] patrol sensor',
						description: 'enable/disable of Maqueen patrol'
					}),
					blockType: BlockType.COMMAND,
					arguments: {
						ENABLE: {
							type: ArgumentType.NUMBER,
							menu: 'maqueenEnable',
							defaultValue: Maqueen_Enable.ENABLE
						}
					}
				},
				{
					opcode: 'maqueenMortor',
					text: formatMessage({
						id: 'maqueen.Mortor',
						default: '[SIDE] motor speed to [SPEED] (-255 to 255)',
						description: 'move Maqeen mortor by speed'
					}),
					blockType: BlockType.COMMAND,
					arguments: {
						SIDE: {
							type: ArgumentType.STRING,
							menu: 'maqueenSideAll',
							defaultValue: Maqueen_Side.LEFT
						},
						SPEED: {
							type: ArgumentType.NUMBER,
							defaultValue: 0
						}
					}
				},
				{
					opcode: 'maqueenMortorStop',
					text: formatMessage({
						id: 'maqueen.MortorStop',
						default: 'Stop all motors',
						description: 'stop all Maqeen mortor'
					}),
					blockType: BlockType.COMMAND
				},
				{
					opcode: 'maqueenMortorSpeed',
					text: formatMessage({
						id: 'maqueen.MortorSpeed',
						default: '[SIDE] motor speed',
						description: 'speed of Maqeen mortor'
					}),
					blockType: BlockType.REPORTER,
					arguments: {
						SIDE: {
							type: ArgumentType.STRING,
							menu: 'maqueenSide',
							defaultValue: Maqueen_Side.LEFT
						}
					}
				},
				//{
				//	opcode: 'maqueenAddSpeed',
				//	text: formatMessage({
				//		id: 'maqueen.addSpeed',
				//		default: 'add [ADD] to speed of mortor',
				//		description: 'add value to speed of Maqeen mortor'
				//	}),
				//	blockType: BlockType.COMMAND,
				//	arguments: {
				//		ADD: {
				//			type: ArgumentType.NUMBER,
				//			defaultValue: 0
				//		},
				//	}
				//},
				//{
				//	opcode: 'maqueenSpeed',
				//	text: formatMessage({
				//		id: 'maqueen.Speed',
				//		default: 'next speed of mortor',
				//		description: 'next speed of Maqeen mortor'
				//	}),
				//	blockType: BlockType.REPORTER
				//},
				{
					opcode: 'maqueenLed',
					text: formatMessage({
						id: 'maqueen.Led',
						default: '[SIDE] LED to [SWITCH]',
						description: 'turn on/off Maqueen LED'
					}),
					blockType: BlockType.COMMAND,
					arguments: {
						SIDE: {
							type: ArgumentType.STRING,
							menu: 'maqueenSideAll',
							defaultValue: Maqueen_Side.LEFT
						},
						SWITCH: {
							type: ArgumentType.STRING,
							menu: 'maqueenSwitch',
							defaultValue: Maqueen_Switch.OFF
						}
					}
				},
				{
					opcode: 'maqueenLedState',
					text: formatMessage({
						id: 'maqueen.LedState',
						default: '[SIDE] LED',
						description: 'status of maqueen LED'
					}),
					blockType: BlockType.REPORTER,
					arguments: {
						SIDE: {
							type: ArgumentType.STRING,
							menu: 'maqueenSide',
							defaultValue: Maqueen_Side.LEFT
						}
					}
				},
				{
					opcode: 'getDistance',
					text: formatMessage({
						id: 'maqueen.getDistance',
						default: 'Distance to the front (cm)',
						description: 'distance to obstacles ahead (cm)'
					}),
					blockType: BlockType.REPORTER
				},
				{
					opcode: 'setDistance',
					text: formatMessage({
						id: 'maqueen.setDistance',
						default: 'Round distance with [ROUND]',
						description: 'round value of distance'
					}),
					blockType: BlockType.COMMAND,
					arguments: {
						ROUND: {
							type: ArgumentType.NUMBER,
							defaultValue: 10
						}
					}
				},
			],
			menus: {
				maqueenEnable: {
					acceptReporters: true,
					items: this.ENABLE_MENU
				},
				maqueenSideAll: {
					acceptReporters: true,
					items: this.SIDE_ALL_MENU
				},
				maqueenSide: {
					acceptReporters: true,
					items: this.SIDE_MENU
				},
				maqueenSwitch: {
					acceptReporters: true,
					items: this.SWITCH_MENU
				}
			}
		};
	}

	maqueenPatrolLeft () {
		return this.instance.patrol[0];
	}
	maqueenPatrolRight () {
		return this.instance.patrol[1];
	}
	maqueenSetPatrol (arg1) {
		this.instance.send(CMD.REQ_PATROL, arg1.ENABLE);
	}

	maqueenMortor (arg1) {
		let speed = parseInt(arg1.SPEED);
		if(speed > 255) speed = 255;
		else if(speed < -255) speed = -255;
		if(arg1.SIDE == Maqueen_Side.LEFT) {
			this.instance.send(CMD.MORTOR_LEFT, speed);
			return;
		}
		if(arg1.SIDE == Maqueen_Side.RIGHT) {
			this.instance.send(CMD.MORTOR_RIGHT, speed);
			return;
		}
		if(arg1.SIDE == Maqueen_Side.ALL) {
			this.instance.send(CMD.MORTOR_ALL, speed);
			return;
		}
	}
	maqueenMortorStop () {
		this.instance.send(CMD.MORTOR_ALL, 0);
	}
	maqueenMortorSpeed (arg1) {
		if(arg1.SIDE == Maqueen_Side.LEFT) {
			return this.instance.mortor[0];
			return;
		}
		if(arg1.SIDE == Maqueen_Side.RIGHT) {
			return this.instance.mortor[1];
		}
		return -1;
	}
	//maqueenSpeed () {
	//	return this.instance.speed;
	//}
	//maqueenAddSpeed (arg1) {
	//	this.instance.send(CMD.MORTOR_SPEED, arg1.SPEED);
	//}

	maqueenLed (arg1) {
		let onoff = (arg1.SWITCH == Maqueen_Switch.ON)? 1 : 0;
		if(arg1.SIDE == Maqueen_Side.LEFT) {
			this.instance.send(CMD.LED_LEFT, onoff);
			return;
		}
		if(arg1.SIDE == Maqueen_Side.RIGHT) {
			this.instance.send(CMD.LED_RIGHT, onoff);
			return;
		}
		if(arg1.SIDE == Maqueen_Side.ALL) {
			this.instance.send(CMD.LED_ALL, onoff);
			return;
		}
	}
	maqueenLedState (arg1) {
		if(arg1.SIDE == Maqueen_Side.LEFT) {
			return this.instance.led[0];
			return;
		}
		if(arg1.SIDE == Maqueen_Side.RIGHT) {
			return this.instance.led[1];
		}
		return -1;
	}

	getDistance () {
		return this.instance.distance;
	}
	setDistance (arg1) {
		this.instance.send(CMD.REQ_DISTANCE, arg1.ROUND);
	}

	setupTranslations () {
		const localeSetup = formatMessage.setup();
		const extTranslations = {
			'ja': {
				'maqueen.PatrolLeft': '????????????????????????(0-???,1-???)',
				'maqueen.PatrolRight': '????????????????????????(0-???,1-???)',
				'maqueen.setPatrol': '????????????????????????[ENABLE]',
				'maqueen.Mortor': '[SIDE]???????????????????????????[SPEED](-255???255)?????????',
				'maqueen.MortorStop': '????????????????????????????????????',
				'maqueen.MortorSpeed': '[SIDE]????????????????????????',
				//'maqueen.Speed': '???????????????????????????',
				//'maqueen.addSpeed': '????????????????????????[ADD]????????????',
				'maqueen.Led': '[SIDE]???LED???[SWITCH]?????????',
				'maqueen.LedState': '[SIDE]???LED',
				'maqueen.getDistance': '?????????????????????(cm)',
				'maqueen.setDistance': '?????????????????????[ROUND]???????????????',
			    "maqueen.sideMenu.left": "???",
			    "maqueen.sideMenu.right": "???",
				'maqueen.sideMenu.all': "?????????",
			    "maqueen.switchMenu.off": "???",
			    "maqueen.switchMenu.on": "???",
				'maqueen.enableMenu.enable': '??????',
				'maqueen.enableManu.disable': '????????????',
			},
		};
		for (const locale in extTranslations) {
			if (!localeSetup.translations[locale]) {
				localeSetup.translations[locale] = {};
			}
			Object.assign(localeSetup.translations[locale], extTranslations[locale]);
		}
	}
}

module.exports = Scratch3_Maqueen_Blocks;
