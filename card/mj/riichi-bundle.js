/* Vendored bundle (plain JS, no transpiling; only a tiny CommonJS shim added) of three MIT-licensed npm packages by takayama-lily:
 * riichi 1.2.0, agari, syanten  - https://github.com/takayama-lily/riichi , /agari , /syanten  (MIT, see LICENSE-riichi.txt)
 * One local patch: penchan-wait fu bug in riichi.calcFu (marked PATCH).
 */
(function(global){
'use strict';
var defs={},cache={};
function req(n){n=n.replace(/^\.\//,'');if(n==='assert')return {deepStrictEqual:function(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('neq');}};if(cache[n])return cache[n].exports;var m={exports:{}};cache[n]=m;defs[n](m,m.exports,req);return m.exports;}
defs['agari']=function(module,exports,require){
/*
 * @Copyright https://github.com/takayama-lily/agari
 */
(()=>{
    
    const sum = (arr)=>{
        let s = 0
        for (let i = 0; i < arr.length; i++)
            s += arr[i]
        return s
    }
    const check7 = (hai_arr)=>{
        let arr = [...hai_arr[0], ...hai_arr[1], ...hai_arr[2], ...hai_arr[3]]
        let s = 0
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i] != 2) return false
            s += arr[i]
        }
        return s == 14
    }
    const check13 = (hai_arr)=>{
        let arr = [hai_arr[0][0], hai_arr[0][8], hai_arr[1][0], hai_arr[1][8], hai_arr[2][0], hai_arr[2][8], ...hai_arr[3]]
        return !arr.includes(0) && sum(arr) == 14
    }
    const _check = (arr, is_jihai = false)=>{
        arr = [...arr]
        let s = sum(arr)
        if (s === 0)
            return true
        if (s % 3 == 2) {
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] >= 2)
                    arr[i] -= 2
                else
                    continue
                if (!_check(arr, is_jihai))
                    arr[i] += 2
                else
                    return true
            }
            return false
        }
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] === 0) {
                continue
            } else if (arr[i] === 3) {
                delete arr[i]
                continue
            } else {
                if (is_jihai || i >= 7)
                    return false
                if (arr[i] === 4)
                    arr[i] -= 3
                arr[i+1] -= arr[i]
                arr[i+2] -= arr[i]
                if (arr[i+1] < 0 || arr[i+2] < 0)
                    return false
                arr[i] = 0
            }
        }
        return true
    }
    const check = (hai_arr)=>{
        let j = 0
        for (let i = 0; i < hai_arr.length; i++) {
            if (sum(hai_arr[i]) % 3 === 1)
                return false
            j += sum(hai_arr[i]) % 3 === 2
        }
        return j === 1 && _check(hai_arr[3], true) && _check(hai_arr[0]) && _check(hai_arr[1]) && _check(hai_arr[2]) 
    }
    const checkAll = (hai_arr)=>{
        return check7(hai_arr) || check13(hai_arr) || check(hai_arr)
    }

    const MPSZ = ['m','p','s','z']
    const sumAll = (hai_arr)=>{
        let s = 0
        for (let arr of hai_arr)
            s += sum(arr)
        return s
    }
    const findKotsu = (hai_arr)=>{
        let res = []
        for (let i = 0; i < hai_arr.length; i++) {
            for (let ii = 0; ii < hai_arr[i].length; ii++) {
                if (hai_arr[i][ii] >= 3) {
                    hai_arr[i][ii] -= 3
                    if (check(hai_arr)) {
                        res.push([ii+1+MPSZ[i]])
                    } else {
                        hai_arr[i][ii] += 3
                    }
                }
            }
        }
        return res
    }
    const findJyuntsu = (hai_arr)=>{
        let res = []
        for (let i = 0; i < hai_arr.length; i++) {
            if (i === 3)
                break
            for (let ii = 0; ii < hai_arr[i].length; ii++) {
                while (hai_arr[i][ii] >= 1 && hai_arr[i][ii+1] >= 1 && hai_arr[i][ii+2] >= 1) {
                    hai_arr[i][ii]--
                    hai_arr[i][ii+1]--
                    hai_arr[i][ii+2]--
                    if (check(hai_arr)) {
                        res.push([ii+1+MPSZ[i], ii+2+MPSZ[i], ii+3+MPSZ[i]])
                    } else {
                        hai_arr[i][ii]++
                        hai_arr[i][ii+1]++
                        hai_arr[i][ii+2]++
                        break
                    }
                }
            }
        }
        return res
    }
    const findJyanto = (hai_arr)=>{
        for (let i = 0; i < hai_arr.length; i++) {
            for (let ii = 0; ii < hai_arr[i].length; ii++) {
                if (hai_arr[i][ii] >= 2) {
                    return ii+1+MPSZ[i]
                }
            }
        }
    }
    let res = []
    const calc = (hai_arr, j)=> {
        let tmp_hai_arr = [[...hai_arr[0]], [...hai_arr[1]], [...hai_arr[2]], [...hai_arr[3]]]
        let first_res = findKotsu(tmp_hai_arr).concat(j)
        if (sumAll(tmp_hai_arr) === 2) {
            res.push(first_res.sort())
        } else if (first_res.length > 0) {
            first_res = first_res.concat(findJyuntsu(tmp_hai_arr))
            res.push(first_res.sort())
        }
        tmp_hai_arr = [[...hai_arr[0]], [...hai_arr[1]], [...hai_arr[2]], [...hai_arr[3]]]
        let second_res = findJyuntsu(tmp_hai_arr).concat(j)
        if (sumAll(tmp_hai_arr) === 2) {
            res.push(second_res.sort())
        } else {
            second_res = second_res.concat(findKotsu(tmp_hai_arr))
            res.push(second_res.sort())
        }
    }
    const findAllAgariPatterns = (hai_arr)=>{
        hai_arr = [[...hai_arr[0]], [...hai_arr[1]], [...hai_arr[2]], [...hai_arr[3]]]
        res = []
        if (!check(hai_arr)) {
            return res
        }
        if (sumAll(hai_arr) === 2) {
            res.push([findJyanto(hai_arr)])
            return res
        }
        let j
        for (let i = 0; i < hai_arr[3].length; i++) {
            if (hai_arr[3][i] === 0) {
                hai_arr[3][i] += 2
                j = i
                break
            }
        }
        for (let i = 0; i < hai_arr.length; i++) {
            for (let ii = 0; ii < hai_arr[i].length; ii++) {
                if (i === 3 && ii === j)
                    continue
                if (hai_arr[i][ii] >= 2) {
                    hai_arr[i][ii] -= 2
                    if (check(hai_arr))
                        calc(hai_arr, ii+1+MPSZ[i])
                    hai_arr[i][ii] += 2
                }
            }
        }
        let final_res = []
        for (let v of res) {
            let is_duplicate = false
            for (let vv of final_res) {
                if (JSON.stringify(v) === JSON.stringify(vv))
                    is_duplicate = true
            }
            if (!is_duplicate)
                final_res.push(v)
        }
        return final_res
    }

    const exports = findAllAgariPatterns //全和了pattern(一般形限定)
    exports.check = check //一般形
    exports.check7 = check7 //七対子形
    exports.check13 = check13 //国士形
    exports.checkAll = checkAll //全形

    if (typeof module === 'object' && module && module.exports) {
        module.exports = exports
    } 
    else if (typeof define === 'function' && define.amd) {
        define(()=>{
            return exports
        })
    }
    else if (typeof self === 'object' && self) {
        self.agari = exports
    }

})()

};
defs['syanten']=function(module,exports,require){
/*
 * @Copyright https://github.com/takayama-lily/syanten
 */
(()=>{
    
    const sum = (arr)=>{
        let s = 0
        for (let i = 0; i < arr.length; i++)
            s += arr[i]
        return s
    }
    const syanten = (hai_arr)=>{
        let res = 9
        let mentsu, tatsu, alone, furo
        mentsu = tatsu = alone = furo = 0
        const search = (arr, is_jihai = false)=>{
            const searchHelper = (arr,index,is_jihai =false,mentsu,tatsu,alone) => {
                let tmp = [0,0,0]
                let max = [mentsu,tatsu,alone]
                if (index === (is_jihai ? 7 : 9)){
                    return max;
                }
                if (arr[index] === 0){
                    tmp = searchHelper(arr,index+1,is_jihai,mentsu,tatsu,alone)
                    if (tmp > max){
                        max = tmp
                    }
                }
                if (arr[index] >= 3){
                    arr[index] -= 3
                    tmp = searchHelper(arr,index,is_jihai,mentsu+1,tatsu,alone)
                    if (tmp > max){
                        max = tmp
                    }
                    arr[index] += 3
                }
                if (arr[index] >= 2){
                    arr[index] -= 2
                    tmp = searchHelper(arr,index,is_jihai,mentsu,tatsu+1,alone)
                    if (tmp > max){
                        max = tmp
                    }
                    arr[index] += 2
                }
                if (arr[index] >= 1){
                    arr[index] -= 1
                    tmp = searchHelper(arr,index,is_jihai,mentsu,tatsu,alone+1)
                    if (tmp > max){
                        max = tmp
                    }
                    arr[index] += 1
                }
                if (!is_jihai){
                    if (arr[index] > 0 && arr[index + 1] > 0 && arr[index + 2] > 0){
                        arr[index]--, arr[index + 1]--, arr[index + 2]--
                        tmp = searchHelper(arr,index,is_jihai,mentsu+1,tatsu,alone)
                        if (tmp > max){
                            max = tmp
                        }
                        arr[index]++, arr[index + 1]++, arr[index + 2]++
                    }
                    if (arr[index] > 0 && arr[index + 2] > 0){
                        arr[index]--, arr[index + 2]--
                        tmp = searchHelper(arr,index,is_jihai,mentsu,tatsu+1,alone)
                        if (tmp > max){
                            max = tmp
                        }
                        arr[index]++, arr[index + 2]++
                    }
                    if (arr[index] > 0 && arr[index + 1] > 0){
                        arr[index]--, arr[index + 1]--
                        tmp = searchHelper(arr,index,is_jihai,mentsu,tatsu+1,alone)
                        if (tmp > max){
                            max = tmp
                        }
                        arr[index]++, arr[index + 1]++
                    }
                }
                return max
            }
            let tmp = searchHelper(arr,0,is_jihai,0,0,0)
            mentsu += tmp[0], tatsu += tmp[1], alone += tmp[2]
        }
        const calc = ()=>{
            let tmp_res = -1
            while (mentsu < 4 - furo) {
                if (tatsu && alone) {
                    tatsu--, alone--, mentsu++, tmp_res++
                    continue
                }
                if (tatsu && !alone) {
                    tatsu--, alone++, mentsu++, tmp_res++
                    continue
                }
                if (!tatsu && alone) {
                    alone -= 2, mentsu++, tmp_res += 2
                }
            }
            if (alone > 0) tmp_res++
            res = tmp_res < res ? tmp_res : res
            mentsu = tatsu = alone = 0
        }
        hai_arr = [[...hai_arr[0]], [...hai_arr[1]], [...hai_arr[2]], [...hai_arr[3]]]
        let arr = [...hai_arr[0], ...hai_arr[1], ...hai_arr[2], ...hai_arr[3]]
        let s = sum(arr)
        if (s > 14 || s % 3 === 0)
            return -2
        furo = Math.round((14 - s) / 3)
        if (s % 3 === 1) {
            for (let i = 33;;i--) {
                if (!arr[i]) {
                    arr[i]++
                    hai_arr[Math.floor(i / 9)][i % 9]++
                    break
                }
            }
        }
        for (let i = 0; i < 34; i++) {
            if (arr[i] === 0)
                continue
            let t = []
            t[0] = [...hai_arr[0]], t[1] = [...hai_arr[1]], t[2] = [...hai_arr[2]], t[3] = [...hai_arr[3]]
            t[Math.floor(i / 9)][i % 9] -= arr[i] >= 2 ? 2 : arr[i]
            search(t[0])
            search(t[1])
            search(t[2])
            search(t[3], true)
            calc()
        }
        return res
    }
    const syanten7 = (hai_arr)=>{
        let cnt = sum(hai_arr[0]) + sum(hai_arr[1]) + sum(hai_arr[2]) + sum(hai_arr[3])
        if (cnt < 13 || cnt > 14)
            return -2
        let arr = [...hai_arr[0], ...hai_arr[1], ...hai_arr[2], ...hai_arr[3]]
        let s = 0, t = 0
        for (let i = 0; i < 34; i++) {
            if (arr[i] >= 2) s++
            if (arr[i] === 1) t++
        }
        if (s + t >= 7)
            return 6 - s
        else
            return 6 - s + (7 - s - t)
    }
    const syanten13 = (hai_arr)=>{
        let cnt = sum(hai_arr[0]) + sum(hai_arr[1]) + sum(hai_arr[2]) + sum(hai_arr[3])
        if (cnt < 13 || cnt > 14)
            return -2
        let arr = [hai_arr[0][0], hai_arr[0][8], hai_arr[1][0], hai_arr[1][8], hai_arr[2][0], hai_arr[2][8], ...hai_arr[3]]
        let s = 0, t = 0
        for (let i = 0; i < 13; i++) {
            if (arr[i]) s++
            if (arr[i] > 1) t = 1
        }
        return 13 - s - t 
    }
    const syantenAll = (hai_arr)=>{
        let s7 = syanten7(hai_arr)
        let s13 = syanten13(hai_arr)
        if (s7 === -2 || s13 === -2)
            return syanten(hai_arr)
        else
            return Math.min(syanten(hai_arr), s7, s13)
    }

    const MPSZ = ['m', 'p', 's', 'z']
    const hairi = (hai_arr, is7or13 = false)=>{
        let syantenCalc = !is7or13 ? syanten : (haiArr)=>{
            return Math.min(syanten7(haiArr), syanten13(haiArr))
        }
        let sht = syantenCalc(hai_arr)
        let res = {now: sht}
        if (sht < 0)
            return res
        let self = []
        const calcHairi = ()=>{
            let map = {}
            for (let i = 0; i < 4; i++) {
                for (let ii = 0; ii < 9; ii++) {
                    if (hai_arr[i][ii] === undefined)
                        continue
                    if (i === self[0] && ii === self[1])
                        continue
                    if (!is7or13 && i == 3 && hai_arr[i][ii] === 0)
                        continue
                    if (!is7or13 && i < 3 && (hai_arr[i][ii] === 0 && !hai_arr[i][ii-1] === 0 && !hai_arr[i][ii-2] === 0 && !hai_arr[i][ii+1] === 0 && !hai_arr[i][ii+1] === 0))
                        continue
                    hai_arr[i][ii]++
                    if (syantenCalc(hai_arr) < sht) {
                        map[ii+1+MPSZ[i]] = 5 - hai_arr[i][ii]
                    }
                    hai_arr[i][ii]--
                }
            }
            return map
        }
        if ((sum(hai_arr[0]) + sum(hai_arr[1]) + sum(hai_arr[2]) + sum(hai_arr[3])) % 3 === 1) {
            res.wait = calcHairi()
            return res
        }
        for (let i = 0; i < 4; i++) {
            for (let ii = 0; ii < 9; ii++) {
                if (hai_arr[i][ii] === 0 || hai_arr[i][ii] === undefined)
                    continue
                hai_arr[i][ii]--
                if (syantenCalc(hai_arr) === sht) {
                    self = [i, ii]
                    res[ii+1+MPSZ[i]] = calcHairi()
                }
                hai_arr[i][ii]++
            }
        }
        return res
    }

    const exports = syantenAll
    exports.syanten = syanten
    exports.syanten7 = syanten7
    exports.syanten13 = syanten13
    exports.syantenAll = syantenAll
    exports.hairi = hairi

    if (typeof module === 'object' && module && module.exports) {
        module.exports = exports
    } 
    else if (typeof define === 'function' && define.amd) {
        define(()=>{
            return exports
        })
    }
    else if (typeof self === 'object' && self) {
        self.syanten = exports
    }

})()

};
defs['yaku']=function(module,exports,require){
/*
 * Copyright (C) https://github.com/takayama-lily/riichi
 */

const assert = require('assert')
const agari = require('agari')
const MPSZ = ['m', 'p', 's', 'z']
const checkAllowed = (o, allowed)=>{
    for (let v of o.hai)
        if (!allowed.includes(v))
            return false
    for (let v of o.furo)
        for (let vv of v)
            if (!allowed.includes(vv))
                return false
    return true
}
const checkChanta = (o, allow)=>{
    let hasJyuntsu = false
    for (let v of o.currentPattern) {
        if (typeof v === 'string') {
            if (!allow.includes(v))
                return false
        } else if (v.length <= 2 || v[0] === v[1]) {
            if (!allow.includes(v[0]))
                return false
        } else {
            hasJyuntsu = true
            let add = parseInt(v[0]) + parseInt(v[1]) + parseInt(v[2])
            if (add > 6 && add < 24)
                return false
        }
    }
    return hasJyuntsu
}
const checkYakuhai = (o, pos)=>{
    for (let v of o.currentPattern) {
        if (typeof v !== 'string' && v[0] === pos + 'z')
            return true
    }
    return false
}

const YAKU =
{
    "国士無双十三面待ち":{"yakuman":2, "isMenzenOnly":true, "check":(o)=>{
        return agari.check13(o.haiArray) && o.hai.reduce((total, v)=>{
            return v === o.agari ? ++total : total
        }, 0) === 2
    }},
    "国士無双":{"yakuman":1, "isMenzenOnly":true, "check":(o)=>{
        return agari.check13(o.haiArray) && o.hai.reduce((total, v)=>{
            return v === o.agari ? ++total : total
        }, 0) === 1
    }},
    "純正九蓮宝燈":{"yakuman":2, "isMenzenOnly":true, "check":(o)=>{
        let i = MPSZ.indexOf(o.agari[1])
        let arr = o.haiArray[i].concat()
        if (arr[0] < 3 || arr[8] < 3 || arr.includes(0))
            return false
        return [2, 4].includes(arr[parseInt(o.agari)-1])
    }},
    "九蓮宝燈":{"yakuman":1, "isMenzenOnly":true, "check":(o)=>{
        let i = MPSZ.indexOf(o.agari[1])
        let arr = o.haiArray[i].concat()
        if (arr[0] < 3 || arr[8] < 3 || arr.includes(0))
            return false
        return [1, 3].includes(arr[parseInt(o.agari)-1])
    }},
    "四暗刻単騎待ち":{"yakuman":2, "isMenzenOnly":true, "check":(o)=>{
        let res = 0
        for (let v of o.currentPattern) {
            if (typeof v === 'string' && v !== o.agari)
                return false
            if (typeof v !== 'string' && v.length <= 2)
                res++
        }
        return res === 4
    }},
    "四暗刻":{"yakuman":1, "isMenzenOnly":true, "check":(o)=>{
        let res = 0
        for (let v of o.currentPattern) {
            if (typeof v === 'string' && v === o.agari)
                return false
            if (typeof v !== 'string' && v.length <= 2)
                res++
        }
        return res === 4
    }},
    "大四喜":{"yakuman":2, "check":(o)=>{
        let need = ['1z', '2z', '3z', '4z']
        let res = 0
        for (let v of o.currentPattern) {
            if (typeof v === 'object' && need.includes(v[0]))
                res++
        }
        return res === 4
    }},
    "小四喜":{"yakuman":1, "check":(o)=>{
        let need = ['1z', '2z', '3z', '4z']
        let res = 0
        for (let v of o.currentPattern) {
            if (typeof v === 'string' && !need.includes(v))
                return false
            if (typeof v === 'object' && need.includes(v[0]))
                res++
        }
        return res === 3
    }},
    "大三元":{"yakuman":1, "check":(o)=>{
        let need = ['5z', '6z', '7z']
        let res = 0
        for (let v of o.currentPattern) {
            if (typeof v === 'object' && need.includes(v[0]))
                res++
        }
        return res === 3
    }},
    "字一色":{"yakuman":1, "check":(o)=>{
        let allow = ['1z', '2z', '3z', '4z', '5z', '6z', '7z']
        return checkAllowed(o, allow)
    }},
    "緑一色":{"yakuman":1, "check":(o)=>{
        let allow = ['2s', '3s', '4s', '6s', '8s', '6z']
        return checkAllowed(o, allow)
    }},
    "清老頭":{"yakuman":1, "check":(o)=>{
        let allow = ['1m', '9m', '1p', '9p', '1s', '9s']
        return checkAllowed(o, allow)
    }},
    "四槓子":{"yakuman":1, "check":(o)=>{
        let res = 0
        for (let v of o.currentPattern)
            if (typeof v !== 'string' && (v.length === 2 || v.length === 4))
                res++
        return res === 4
    }},
    "天和":{"yakuman":1, "isMenzenOnly":true, "check":(o)=>{
        return o.extra.includes('t') && o.isTsumo && o.isOya && !o.furo.length
    }},
    "地和":{"yakuman":1, "isMenzenOnly":true, "check":(o)=>{
        return o.extra.includes('t') && o.isTsumo && !o.isOya && !o.furo.length
    }},
    "人和":{"yakuman":1, "isMenzenOnly":true, "isLocal":true, "check":(o)=>{
        return o.extra.includes('t') && !o.isTsumo && !o.isOya && !o.furo.length
    }},
    "大七星":{"yakuman":1, "isMenzenOnly":true, "isLocal":true, "check":(o)=>{
        let allow = ['1z', '2z', '3z', '4z', '5z', '6z', '7z']
        return checkAllowed(o, allow) && YAKU['七対子'].check(o)
    }},
    "清一色":{"han":6, "isFuroMinus":true, "check":(o)=>{
        let must = o.agari[1]
        let allow = []
        for (let i = 1; i <= 9; i++)
            allow.push(i + must)
        return checkAllowed(o, allow)
    }},
    "混一色":{"han":3, "isFuroMinus":true, "check":(o)=>{
        let allow = ['1z', '2z', '3z', '4z', '5z', '6z', '7z']
        let d = ''
        for (let v of o.hai) {
            if (['m', 'p', 's'].includes(v[1])) {
                d = v[1]
                break
            }
        }
        if (!d) {
            for (let v of o.furo) {
                for (let vv of v) {
                    if (['m', 'p', 's'].includes(vv[1])) {
                        d = vv[1]
                        break
                    }
                }
            }
        }
        if (!d)
            return false
        for (let i = 1; i <= 9; i++)
            allow.push(i + d)
        return checkAllowed(o, allow) && !YAKU['清一色'].check(o)
    }},
    "二盃口":{"han":3, "isMenzenOnly":true, "check":(o)=>{
        let arr = []
        for (let v of o.currentPattern) {
            if (typeof v === 'string')
                continue
            if (v.length !== 3 || v[0] === v[1])
                return false
            arr.push(v[0])
        }
        return arr[0]+arr[2] === arr[1]+arr[3]
    }},
    "純全帯么九":{"han":3, "isFuroMinus":true, "check":(o)=>{
        let allow = ['1m', '9m', '1p', '9p', '1s', '9s']
        return checkChanta(o, allow)
    }},
    "混全帯么九":{"han":2, "isFuroMinus":true, "check":(o)=>{
        let allow = ['1m', '9m', '1p', '9p', '1s', '9s', '1z', '2z', '3z', '4z', '5z', '6z', '7z']
        return checkChanta(o, allow) && !YAKU['純全帯么九'].check(o)
    }},
    "対々和":{"han":2, "check":(o)=>{
        let res = 0
        for (let v of o.currentPattern)
            if (v.length === 1 || v[0] === v[1])
                res++
        return res === 4
    }},
    "混老頭":{"han":2, "check":(o)=>{
        let allow = ['1m', '9m', '1p', '9p', '1s', '9s', '1z', '2z', '3z', '4z', '5z', '6z', '7z']
        return checkAllowed(o, allow)
    }},
    "三槓子":{"han":2, "check":(o)=>{
        let res = 0
        for (let v of o.currentPattern)
            if (typeof v !== 'string' && (v.length === 2 || v.length === 4))
                res++
        return res === 3
    }},
    "小三元":{"han":2, "check":(o)=>{
        let need = ['5z', '6z', '7z']
        let res = 0
        for (let v of o.currentPattern) {
            if (typeof v === 'string' && !need.includes(v))
                return false
            if (typeof v === 'object' && need.includes(v[0]))
                res++
        }
        return res === 2
    }},
    "三色同刻":{"han":2, "check":(o)=>{
        let res = [0,0,0,0,0,0,0,0,0]
        for (let v of o.currentPattern) {
            if ((v.length === 1 || v[0] === v[1]) && !v[0].includes('z'))
                res[parseInt(v[0])-1]++
            else
                continue
        }
        return res.includes(3)
    }},
    "三暗刻":{"han":2, "check":(o)=>{
        let res = 0
        for (let v of o.currentPattern)
            if (typeof v !== 'string' && v.length <= 2)
                res++
        return res === 3
    }},
    "七対子":{"han":2, "isMenzenOnly":true, "check":(o)=>{
        return agari.check7(o.haiArray) && !YAKU['二盃口'].check(o)
    }},
    "ダブル立直":{"han":2, "isMenzenOnly":true, "check":(o)=>{
        return o.extra.includes('w') && !o.furo.length
    }},
    "一気通貫":{"han":2, "isFuroMinus":true, "check":(o)=>{
        let res = [0,0,0,0,0,0,0,0,0]
        for (let v of o.currentPattern) {
            if (v.length <= 2 || v[0] === v[1])
                continue
            if ([1,4,7].includes(parseInt(v[0]))) {
                let i = MPSZ.indexOf(v[0][1])*3 + (parseInt(v[0])-1)/3
                res[i]++
            }
        }
        return (res[0] && res[1] && res[2]) || (res[3] && res[4] && res[5]) || (res[6] && res[7] && res[8])
    }},
    "三色同順":{"han":2, "isFuroMinus":true, "check":(o)=>{
        let res = [];
        for (let v of o.currentPattern) {
            if (v.length <= 2 || v[0] === v[1] || v[0].includes('z')) continue;

            let value = parseInt(v[0]);
            res[value] = res[value] ? res[value] : new Set();
            res[value].add(v[0][1]);
        }
        return res.some((value) => value.size === 3);
    }},
    "断么九":{"han":1, "check":(o)=>{
        for (let v of o.furo)
            if (!o.allowKuitan && v.length !== 2)
                return false
        let allow = ['2m', '3m', '4m', '5m', '6m', '7m', '8m', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '2s', '3s', '4s', '5s', '6s', '7s', '8s']
        return checkAllowed(o, allow)
    }},
    "平和":{"han":1, "isMenzenOnly":true, "check":(o)=>{
        let hasAgariFu = true
        for (let v of o.currentPattern) {
            if (typeof v === 'string')  {
                if (v.includes('z') && [o.bakaze, o.jikaze, 5, 6, 7].includes(parseInt(v)))
                    return false
            } else if (v.length !== 3 || v[0] === v[1]) {
                return false
            } else if ((v[0] === o.agari && parseInt(v[2]) !== 9) || (v[2] === o.agari && parseInt(v[0]) !== 1)) {
                hasAgariFu = false
            }
        }
        return !hasAgariFu
    }},
    "一盃口":{"han":1, "isMenzenOnly":true, "check":(o)=>{
        if (YAKU['二盃口'].check(o))
            return false
        for (let i in o.currentPattern) {
            i = parseInt(i)
            let v = o.currentPattern[i]
            if (v.length === 3 && v[0] != v[1]) {
                while (i < 4) {
                    i++
                    try {
                        assert.deepStrictEqual(v, o.currentPattern[i])
                        return true
                    } catch(e) {}
                }
            }
        }
        return false
    }},
    "門前清自摸和":{"han":1, "isMenzenOnly":true, "check":(o)=>{
        return o.isTsumo
    }},
    "立直":{"han":1, "isMenzenOnly":true, "check":(o)=>{
        return (YAKU['一発'].check(o) || (o.extra.includes('r') || o.extra.includes('l'))) && !YAKU['ダブル立直'].check(o)
    }},
    "一発":{"han":1, "isMenzenOnly":true, "check":(o)=>{
        return o.extra.includes('i') || o.extra.includes('y')
    }},
    "嶺上開花":{"han":1, "check":(o)=>{
        let hasKantsu = false
        for (let v of o.furo) {
            if (v.length === 2 || v.length === 4) {
                hasKantsu = true
                break
            }
        }
        return hasKantsu && o.extra.includes('k') && !o.extra.includes('h') && o.isTsumo && !YAKU['一発'].check(o)
    }},
    "搶槓":{"han":1, "check":(o)=>{
        return o.extra.includes('k') && !o.extra.includes('h') && !o.isTsumo
    }},
    "海底摸月":{"han":1, "check":(o)=>{
        return o.extra.includes('h') && o.isTsumo
    }},
    "河底撈魚":{"han":1, "check":(o)=>{
        return o.extra.includes('h') && !o.isTsumo && !YAKU['一発'].check(o)
    }},
    "場風東":{"han":1, "check":(o)=>{
        return o.bakaze === 1 && checkYakuhai(o, 1)
    }},
    "場風南":{"han":1, "check":(o)=>{
        return o.bakaze === 2 && checkYakuhai(o, 2)
    }},
    "場風西":{"han":1, "check":(o)=>{
        return o.bakaze === 3 && checkYakuhai(o, 3)
    }},
    "場風北":{"han":1, "check":(o)=>{
        return o.bakaze === 4 && checkYakuhai(o, 4)
    }},
    "自風東":{"han":1, "check":(o)=>{
        return o.jikaze === 1 && checkYakuhai(o, 1)
    }},
    "自風南":{"han":1, "check":(o)=>{
        return o.jikaze === 2 && checkYakuhai(o, 2)
    }},
    "自風西":{"han":1, "check":(o)=>{
        return o.jikaze === 3 && checkYakuhai(o, 3)
    }},
    "自風北":{"han":1, "check":(o)=>{
        return o.jikaze === 4 && checkYakuhai(o, 4)
    }},
    "役牌白":{"han":1, "check":(o)=>{
        return checkYakuhai(o, 5)
    }},
    "役牌発":{"han":1, "check":(o)=>{
        return checkYakuhai(o, 6)
    }},
    "役牌中":{"han":1, "check":(o)=>{
        return checkYakuhai(o, 7)
    }},
}
module.exports = YAKU

};
defs['riichi']=function(module,exports,require){
/*
 * Copyright (C) https://github.com/takayama-lily/riichi
 */

const agari = require('agari')
const syanten = require('syanten')
const YAKU = require('./yaku')
const MPSZ = ['m', 'p', 's', 'z']
const KAZE = [undefined, '東', '南' ,'西', '北', '白', '發', '中']
const ceil10 = (num)=>{
    return Math.ceil(num/10)*10
}
const ceil100 = (num)=>{
    return Math.ceil(num/100)*100
}
const isHai = (text)=>{
    return typeof text === 'string' && text.length === 2 && !isNaN(text[0]) && MPSZ.includes(text[1])
}
const is19 = (text)=>{
    return isHai(text) && (text.includes('1') || text.includes('9') || text.includes('z'))
}
const isFuro = (arr)=>{
    if (arr instanceof Array !== true || arr.length > 4 || arr.length < 2)
        return false
    let set = new Set(arr)
    if (set.size === 1)
        return isHai(arr[0])
    else {
        if (set.size !== 3)
            return false
        let minus1 = parseInt(arr[1]) - parseInt(arr[0])
        let minus2 = parseInt(arr[2]) - parseInt(arr[1])
        if (minus1 !== minus2 || minus1 !== 1)
            return false
    }
    return true
}

/**
 * string型牌 → array型牌
 * 赤dora抽出
 */
const parse = (text)=>{
    let tmp = []
    let aka = 0
    for (let v of text) {
        if (!isNaN(v)) {
            if (v === '0')
                v = '5', aka++
            tmp.push(v)
        }
        if (MPSZ.includes(v)) {
            for (let k in tmp)
                if (!isNaN(tmp[k]))
                    tmp[k] += v
        }
    }
    let res = []
    for (let v of tmp)
        if (isNaN(v))
            res.push(v)
    return {'res': tmp, 'aka': aka}
}

class Riichi {
    /**
     * @param string data
     */
    constructor(data) {
        this.hai = [] //array型手牌(和了牌含) 例:['1m', '1m', '1m', '2m', '2m']
        this.haiArray = [ // 複合array型手牌(和了牌含)
            [0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0]
        ]
        this.furo = [] //副露 例:[['1m', '1m', '1m'], ['2m', '2m'], ['3m', '4m', '5m'], ['6m', '6m', '6m', '6m']]
        this.agari = '' //和了牌 例:'2m'
        this.dora = [] //dora 例:['6z', '7z']
        this.extra = '' //付属役 例:'riho22' ※付属役一覧参照
        this.isTsumo = true //true:自摸 false:栄和
        this.isOya = false //true:親家 false:子家
        this.bakaze = 1 //場風 1234=東南西北
        this.jikaze = 2 //自風 1234=東南西北
        this.aka = 0 //赤dora枚数
        this.agariPatterns = []
        this.currentPattern
        this.tmpResult = { //臨時計算結果
            'isAgari': false, //和了?
            'yakuman': 0, //役満倍数
            'yaku': {}, //手役 例:{'天和':'役満','大四喜':'ダブル役満'} 例:{'立直':'1飜','清一色':'6飜'}
            'han': 0, //飜数
            'fu': 0, //符数
            'ten': 0, //点数(this.isOya=undefined場合，計算不能)
            'name': '', //例:'満貫'、'跳満'、'倍満'、'三倍満'、'数え役満'
            'text': '', //結果text 例:'30符4飜'、'40符4飜 満貫'、'6倍役満'
            'oya': [0, 0, 0], //親家得点 例:[2600,2600,2600]、[7700]
            'ko': [0, 0, 0], //子家得点 例:[3900,2000,2000]、[7700]
            'error': true //input error
        }
        this.finalResult //最終計算結果

        this.allLocalEnabled = false //全部local役許可
        this.localEnabled = [] //local役許可list
        this.disabled = [] //禁止役 例:['renho', 'wriichi']
        this.allowWyakuman = true //false:二倍役満禁止
        this.allowKuitan = true //false:喰断禁止
        this.allowAka = true //false:赤dora禁止
        this.hairi = true //未和了の場合、牌理を計算

        // 初期設定
        if (typeof data !== 'string')
            return
        data = data.toLowerCase()
        let arr = data.split('+')
        let hai = arr.shift()
        for (let v of arr) {
            if (!v.includes('m') && !v.includes('p') && !v.includes('s') && !v.includes('z'))
                this.extra = v
            else if (v[0] === 'd')
                this.dora = parse(v.substr(1)).res
            else if (isHai(v)) {
                hai += v
                this.isTsumo = false
            } else {
                let tmp = []
                for (let vv of v) {
                    if (MPSZ.includes(vv)) {
                        for (let k in tmp)
                            tmp[k] += vv
                        if (isFuro(tmp))
                            this.furo.push(tmp.sort())
                        tmp = []
                    } else {
                        if (vv === '0')
                            vv = '5', this.aka++
                        tmp.push(vv)
                    }
                }
            }
        }

        let tmp = parse(hai)
        this.hai = tmp.res
        this.aka += tmp.aka
        this.agari = this.hai.slice(-1)[0]

        if (this.hai.length % 3 === 0)
            return
        if (this.hai.length + this.furo.length * 3 > 14)
            return

        // array型手牌 → 複合array型 転換
        for (let v of this.hai) {
            let n = parseInt(v)
            let i = MPSZ.indexOf(v.replace(n, ''))
            this.haiArray[i][n-1]++
        }

        // 場風自風設定
        let kaze = this.extra.replace(/[a-z]/g, '')
        if (kaze.length === 1)
            this.jikaze = parseInt(kaze)
        if  (kaze.length > 1) {
            this.bakaze = parseInt(kaze[0])
            this.jikaze = parseInt(kaze[1])
        }
        if (this.jikaze === 1)
            this.isOya = true
        else
            this.isOya = false

        this.tmpResult.error = false
        this.finalResult = JSON.parse(JSON.stringify(this.tmpResult))
    }

    /**
     * 門前判定
     */
    isMenzen() {
        for (let v of this.furo)
            if (v.length > 2)
                return false
        return true
    }

    /**
     * dora枚数計算
     */
    calcDora() {
        if (!this.tmpResult.han)
            return
        let dora = 0
        for (let v of this.hai) {
            for (let vv of this.dora) {
                if (v === vv)
                    dora++
            }
        }
        for (let v of this.furo) {
            if (v.length === 2)
                v = v.concat(v)
            for (let vv of v) {
                for (let vvv of this.dora) {
                    if (vvv === vv)
                        dora++
                }
            }
        }
        if (dora) {
            this.tmpResult.han += dora
            this.tmpResult.yaku['ドラ'] = dora + '飜'
        }
        if (this.allowAka && this.aka) {
            this.tmpResult.han += this.aka
            this.tmpResult.yaku['赤ドラ'] = this.aka + '飜'
        }
    }

    /**
     * 符計算
     */
    calcFu() { 
        let fu = 0
        if (this.tmpResult.yaku['七対子']) {
            fu = 25
        } else if (this.tmpResult.yaku['平和']) {
            fu = this.isTsumo ? 20 : 30
        } else {
            fu = 20
            let hasAgariFu = false
            if (!this.isTsumo && this.isMenzen())
                fu += 10
            for (let v of this.currentPattern) {
                if (typeof v === 'string') {
                    if (v.includes('z')) 
                        for (let vv of [this.bakaze, this.jikaze, 5, 6, 7])
                            if (parseInt(v) === vv)
                                fu += 2
                    if (this.agari === v)
                        hasAgariFu = true
                } else {
                    if (v.length === 4)
                        fu += is19(v[0]) ? 16 : 8
                    else if (v.length === 2)
                        fu += is19(v[0]) ? 32 : 16
                    else if (v.length === 1)
                        fu += is19(v[0]) ? 8 : 4
                    else if (v.length === 3 && v[0] === v[1])
                        fu += is19(v[0]) ? 4 : 2
                    else if (!hasAgariFu) {
                        if (v[1] === this.agari)
                            hasAgariFu = true
                        else if (v[0] === this.agari && parseInt(v[2]) === 9) /* PATCH(mahjong.html): penchan wait fu bug */
                            hasAgariFu = true
                        else if (v[2] === this.agari && parseInt(v[0]) === 1) /* PATCH(mahjong.html) */
                            hasAgariFu = true
                    }
                }
            }

            if (hasAgariFu)
                fu += 2
            if (this.isTsumo)
                fu += 2

            fu = ceil10(fu)
            if (fu < 30)
                fu = 30
        }
        this.tmpResult.fu = fu
    }

    /**
     * 点数計算
     */
    calcTen() {
        this.tmpResult.name = ''
        let base
        this.tmpResult.text = `(${KAZE[this.bakaze]}場`
        this.tmpResult.text += KAZE[this.jikaze] + '家)'
        this.tmpResult.text += this.isTsumo ? '自摸' : '栄和'
        if (this.tmpResult.yakuman) {
            base = 8000 * this.tmpResult.yakuman
            this.tmpResult.name = this.tmpResult.yakuman > 1 ? (this.tmpResult.yakuman + '倍役満') : '役満'
        } else {
            if (!this.tmpResult.han)
                return
            base = this.tmpResult.fu * Math.pow(2, this.tmpResult.han + 2)
            this.tmpResult.text += ' ' + this.tmpResult.fu + '符' + this.tmpResult.han + '飜'
            if (base > 2000) {
                if (this.tmpResult.han >= 13) {
                    base = 8000
                    this.tmpResult.name = '数え役満'
                } else if (this.tmpResult.han >= 11) {
                    base = 6000
                    this.tmpResult.name = '三倍満'
                } else if (this.tmpResult.han >= 8) {
                    base = 4000
                    this.tmpResult.name = '倍満'
                } else if (this.tmpResult.han >= 6) {
                    base = 3000
                    this.tmpResult.name = '跳満'
                } else {
                    base = 2000
                    this.tmpResult.name = '満貫'
                }
            }
        }
        this.tmpResult.text += (this.tmpResult.name ? ' ' : '') + this.tmpResult.name
        if (this.isTsumo) {
            this.tmpResult.oya = [ceil100(base*2),ceil100(base*2),ceil100(base*2)]
            this.tmpResult.ko = [ceil100(base*2),ceil100(base),ceil100(base)]
        } else {
            this.tmpResult.oya = [ceil100(base*6)]
            this.tmpResult.ko = [ceil100(base*4)]
        }
        this.tmpResult.ten = this.isOya ? eval(this.tmpResult.oya.join('+')) : eval(this.tmpResult.ko.join('+'))
        this.tmpResult.text += ' ' + this.tmpResult.ten + '点'
        if (this.isTsumo) {
            this.tmpResult.text += '('
            if (this.isOya)
                this.tmpResult.text += this.tmpResult.oya[0] + 'all'
            else
                this.tmpResult.text += this.tmpResult.ko[0] + ',' + this.tmpResult.ko[1]
            this.tmpResult.text += ')'
        }

    }

    /**
     * 手役計算
     */
    calcYaku() {
        this.tmpResult.yaku = {}
        this.tmpResult.yakuman = 0
        this.tmpResult.han = 0
        for (let k in YAKU) {
            let v = YAKU[k]
            if (this.disabled.includes(k))
                continue
            if (v.isLocal && !this.allLocalEnabled && !this.localEnabled.includes(k))
                continue
            if (this.tmpResult.yakuman && !v.yakuman)
                continue
            if (v.isMenzenOnly && !this.isMenzen())
                continue
            if (v.check(this)) {
                if (v.yakuman) {
                    let n = this.allowWyakuman ? v.yakuman : 1
                    this.tmpResult.yakuman += n
                    this.tmpResult.yaku[k] = n > 1 ? 'ダブル役満' : '役満'
                } else {
                    let n = v.han
                    if (v.isFuroMinus && !this.isMenzen())
                        n--
                    this.tmpResult.yaku[k] = n + '飜'
                    this.tmpResult.han += n
                }
            }
        }
    }

    // api exports ↓ ----------------------------------------------------------------------------------------------------

    disableWyakuman() { //二倍役満禁止
        this.allowWyakuman = false
    }
    disableKuitan() { //喰断禁止
        this.allowKuitan = false
    }
    disableAka() { //赤dora禁止
        this.allowAka = false
    }
    enableLocalYaku(name) { //指定local役有効
        this.localEnabled.push(name)
    }
    disableYaku(name) { //指定役禁止
        this.disabled.push(name)
    }

    // supported local yaku list
    // 大七星 役満(字一色別)
    // 人和 役満
    // 

    disableHairi() {
        this.hairi = false
    }

    /**
     * main
     */
    calc() {
        if (this.tmpResult.error) {
            return this.tmpResult
        }
        this.tmpResult.isAgari = agari.checkAll(this.haiArray)
        if (!this.tmpResult.isAgari || this.hai.length + this.furo.length * 3 !== 14) {
            if (this.hairi) {
                this.tmpResult.hairi = syanten.hairi(this.haiArray)
                this.tmpResult.hairi7and13 = syanten.hairi(this.haiArray, true)
            }
            return this.tmpResult
        }

        this.finalResult.isAgari = true
        if (this.extra.includes('o'))
            this.allLocalEnabled = true
        
        this.agariPatterns = agari(this.haiArray)
        if (!this.agariPatterns.length)
            this.agariPatterns.push([])
        for (let v of this.agariPatterns) {
            if (!this.isTsumo) {
                for (let k in v) {
                    let vv = v[k]
                    if (vv.length === 1 && vv[0] === this.agari) {
                        let i = MPSZ.indexOf(this.agari[1])
                        if (this.haiArray[i][parseInt(this.agari)-1] < 4)
                            v[k] = [vv[0], vv[0], vv[0]]
                    }
                }
            }
            this.currentPattern = v.concat(this.furo)
            this.calcYaku()
            if (!this.tmpResult.yakuman && !this.tmpResult.han)
                continue
            if (this.tmpResult.han) {
                this.calcDora()
                this.calcFu()
            }
            this.calcTen()
            if (this.tmpResult.ten > this.finalResult.ten)
                this.finalResult = JSON.parse(JSON.stringify(this.tmpResult))
            else if (this.tmpResult.ten === this.finalResult.ten && this.tmpResult.han > this.finalResult.han)
                this.finalResult = JSON.parse(JSON.stringify(this.tmpResult))
        }

        if (!this.finalResult.ten)
            this.finalResult.text = '無役'
        return this.finalResult
    }
}
module.exports = Riichi

};
global.MJLib={Riichi:req('riichi'),agari:req('agari'),syanten:req('syanten')};
})(typeof window!=='undefined'?window:this);