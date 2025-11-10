import axios from 'axios';
import md5 from 'md5';
import { v4 } from 'uuid';

const WEB_HOST = 'api-takumi.mihoyo.com'
const APP_VERSION = '2.81.1'

const COMMON__HEADERS = {
  "DS": '',
  "Cookie": '',
  "Host": WEB_HOST,
  "User-Agent": `Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) miHoYoBBS/${APP_VERSION}`,
  "x-rpc-app_version": APP_VERSION,
  "x-rpc-client_type": 5,
  "Accept-Language": "zh-CN,zh-Hans;q=0.9",
  "Accept": "application/json, text/plain, */*",
}
let ROLE_HEADERS = {
  "Referer": 'https://webstatic.mihoyo.com/',
  "x-rpc-device_id": v4(),
  "Origin": "https://webstatic.mihoyo.com",
  "x-rpc-challenge": 'null',
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br",
};
let SIGN_HEADERS = {
  "Referer": "https://act.mihoyo.com/",
  "x-rpc-device_model": "iPhone14,4",
  "x-rpc-device_id": v4(),
  "x-rpc-platform": 1,
  "x-rpc-device_name": "iPhone",
  "Origin": "https://act.mihoyo.com",
  "Sec-Fetch-Site": "same-site",
  "Connection": "keep-alive",
  "Content-Type": "application/json;charset=utf-8",
}

const $axios = axios.create({})

const getCookieConfig = async () => {
  const MYSCookies = process.env.MYS_COOKIES;
  if (!MYSCookies) {
    console.error("Missing required environment variables.");
    return { Genshin: [], StarRail: [], Zenless: [] }
  }
  const MYSCookieArr = MYSCookies ? MYSCookies.split(',') : []
  return { Genshin: MYSCookieArr, StarRail: MYSCookieArr, Zenless: MYSCookieArr }
}

const randomSleep = (min, max) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min
  console.log(`Sleeping for ${delay} seconds...`);
  return new Promise((resolve) => setTimeout(resolve, delay * 1000))
}

async function getDS() {
  const s = "yUZ3s0Sna1IrSNfk29Vo6vRapdOyqyhB";
  const t = Math.floor(Date.now() / 1e3);
  const r = Math.random().toString(36).slice(-6);
  const c = `salt=${s}&t=${t}&r=${r}`;
  return `${t},${r},${md5(c)}`;
}

const getHeaders = async (Cookie, whichHeader) => {
  return { ...COMMON__HEADERS, ...whichHeader, Cookie, DS: await getDS() }
}

const getRoles = async (cookie, gameKey) => {
  const GAME_BIZ = { 
    Genshin: 'hk4e_cn', 
    StarRail: 'hkrpg_cn',
    Zenless: 'nap_cn'
  }
  const headers = await getHeaders(cookie, ROLE_HEADERS)
  const res = await $axios.request({
    method: 'GET',
    headers,
    url: `https://${WEB_HOST}/binding/api/getUserGameRolesByCookie?game_biz=${GAME_BIZ[gameKey]}`
  }).catch(err => {
    console.error('Login error\n' + err)
    return null
  })
  
  if (!res?.data) {
    console.error(`[${gameKey}] No response data`)
    return []
  }
  
  if (res.data.retcode !== 0) {
    console.info(`[${gameKey}] Account not logged in, please check cookie`, JSON.stringify(res.data))
    return []
  }
  
  if (res.data.message === 'OK' && res.data.data.list && res.data.data.list.length > 0) {
    console.log(`[${gameKey}] Found ${res.data.data.list.length} roles:`, res.data.data.list.map(role => `${role.nickname}(${role.game_uid})[${role.region_name}]`).join(', '))
    return res.data.data.list
  } else {
    console.log(`[${gameKey}] No character found`)
    return []
  }
}

async function Sign_In(cookie, gameKey, role) {
  const ACT_ID = { 
    Genshin: 'e202311201442471', 
    StarRail: 'e202304121516551',
    Zenless: 'e202406242138391'
  }
  
  // 原神官服和B服的region映射
  const REGION_MAP = {
    Genshin: {
      '天空岛': 'cn_gf01',      // 官服
      '世界树': 'cn_qd01'       // B服
    },
    StarRail: {
      '星穹列车': 'prod_gf_cn'  // 星穹铁道只有官服
    },
    Zenless: {
      '新艾利都': 'prod_gf_cn'  // 绝区零只有官服
    }
  }

  const SIGNGAME = { 
    Genshin: 'hk4e', 
    StarRail: 'hkrpg',
    Zenless: 'zzz'
  }

  // 根据服务器名称获取region
  let region = 'cn_gf01'; // 默认官服
  if (gameKey === 'Genshin' && role.region_name) {
    region = REGION_MAP.Genshin[role.region_name] || 'cn_gf01';
    console.log(`[${gameKey}] Detected server: ${role.region_name}, using region: ${region}`);
  } else if (gameKey === 'StarRail') {
    region = 'prod_gf_cn';
  } else if (gameKey === 'Zenless') {
    region = 'prod_gf_cn';
  }

  const headers = await getHeaders(cookie, { ...SIGN_HEADERS, 'x-rpc-signgame': SIGNGAME[gameKey] })
  const data = {
    act_id: ACT_ID[gameKey],
    region: region,
    uid: role.game_uid,
    lang: 'zh-cn'
  }
  
  console.log(`[${gameKey}] Signing in ${role.nickname}(${role.game_uid})[${role.region_name}] with data:`, JSON.stringify(data));
  
  const res = await $axios.request({
    method: 'POST',
    headers,
    data,
    url: `https://${WEB_HOST}/event/luna/${SIGNGAME[gameKey]}/sign`
  }).catch(err => {
    console.error('Sign-in error\n' + err)
    return null
  })
  
  if (res?.data) {
    const success = res.data.message === 'OK' || res.data.retcode === -5003; // -5003 表示已签到
    console.log(`<${role.nickname}(${role.game_uid})[${role.region_name}]> Sign-in ${success ? 'successful' : 'failed'}: `, JSON.stringify(res.data))
    return success
  } else {
    console.log(`[${gameKey}] Sign-in failed: No response data`)
    return false
  }
}

const doMYSSign = async (gameKey) => {
  const CONF = await getCookieConfig()
  const cookieList = CONF[gameKey]
  if (cookieList.length) {
    console.info(`[${gameKey}] Start signing in, total ${cookieList.length} users\n`)
    for (const cookIndex in cookieList) {
      const cook = cookieList[cookIndex]
      if (cook) {
        console.log(`[${gameKey}] User ${Number(cookIndex) + 1} starts signing in...`)
        const roles = await getRoles(cook, gameKey)
        if (roles.length > 0) {
          for (const role of roles) {
            await Sign_In(cook, gameKey, role)
            await randomSleep(3, 6) // 角色间短暂延迟
          }
        } else {
          console.log(`[${gameKey}] User ${Number(cookIndex) + 1} has no ${gameKey} character, skipping...`)
        }
        await randomSleep(3, 9) // 用户间较长延迟
      }
    }
    console.info(`[${gameKey}] Sign-in completed\n`)
  }
}

export { doMYSSign }
