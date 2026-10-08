// 自补模块：web-katrain 缺失的 utils/gameLogic（featuresV7 依赖）。
export function getOpponent(player) {
  return player === 'black' ? 'white' : 'black';
}
