// Public settings snapshot. No developer credentials.
export const SETTINGS = {
  "home": {
    "title": "奶娃Jump",
    "tagline": "向上，再向上。",
    "startLabel": "开始跳跃",
    "help": "奶娃会自动跳跃。电脑用 A / D 或左右方向键；手机按住左右按钮。",
    "tiltEnabled": false
  },
  "player": {
    "gravity": 1600,
    "jump": 720,
    "speed": 270,
    "response": 16,
    "brake": 23
  },
  "character": {
    "height": 78
  },
  "difficulty": [
    {
      "height": 0,
      "name": "起步",
      "width": 78,
      "gapMin": 104,
      "gapMax": 116,
      "shiftMin": 50,
      "amplitudeX": 44,
      "amplitudeY": 30,
      "frequency": 0.65,
      "fixedCount": 2,
      "bonusChance": 0.12
    },
    {
      "height": 100,
      "name": "进阶",
      "width": 70,
      "gapMin": 112,
      "gapMax": 128,
      "shiftMin": 60,
      "amplitudeX": 48,
      "amplitudeY": 33,
      "frequency": 1,
      "fixedCount": 2,
      "bonusChance": 0.16
    },
    {
      "height": 250,
      "name": "挑战",
      "width": 62,
      "gapMin": 118,
      "gapMax": 134,
      "shiftMin": 70,
      "amplitudeX": 52,
      "amplitudeY": 36,
      "frequency": 1.4,
      "fixedCount": 1,
      "bonusChance": 0.2
    },
    {
      "height": 500,
      "name": "高难",
      "width": 56,
      "gapMin": 124,
      "gapMax": 138,
      "shiftMin": 78,
      "amplitudeX": 56,
      "amplitudeY": 39,
      "frequency": 1.85,
      "fixedCount": 1,
      "bonusChance": 0.24
    },
    {
      "height": 800,
      "name": "极限",
      "width": 50,
      "gapMin": 128,
      "gapMax": 140,
      "shiftMin": 86,
      "amplitudeX": 60,
      "amplitudeY": 42,
      "frequency": 2.3,
      "fixedCount": 1,
      "bonusChance": 0.28
    }
  ],
  "items": {
    "spring": {
      "velocity": 1120,
      "chance": 0.13
    },
    "hat": {
      "speed": 330,
      "duration": 4,
      "chance": 0.065
    },
    "rocket": {
      "speed": 760,
      "duration": 3.5,
      "chance": 0.035
    },
    "cooldown": 3,
    "exitVelocity": 230,
    "exitEase": 0.5
  },
  "world": [
    {
      "name": "幽光矿洞",
      "start": 0
    },
    {
      "name": "青翠山林",
      "start": 250
    },
    {
      "name": "群山之巅",
      "start": 500
    },
    {
      "name": "寂静雪山",
      "start": 750
    },
    {
      "name": "天际云海",
      "start": 1000
    },
    {
      "name": "远古星河",
      "start": 1250
    }
  ]
};
