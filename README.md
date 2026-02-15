klutzy 지뢰찾기 기반의 로컬에서 동작하는 웹 버전 지뢰찾기 

<img src="/a1.png" alt="a">
<img src="/a2.png" alt="a">
<img src="/a5.png" alt="a">
<img src="/a3.png" alt="a">
<img src="/a4.png" alt="a">

* <del>매우 많은</del>약간의 버그 수정함
   
* 지능적인 판 생성 기능 추가
  * 찍기 패턴 차단, 자동 풀기 기능 제공
    
* 초대형 판을 위한 최적화 <del>사실상 다시 짬</del>
  * 최소 1280*720 이상 크기의 판 생성 가능 (실제 상한이 몇인지는 확인해 보지 않음)
  * 지뢰의 최대 개수는 판이 충분히 크다면 무제한임 (세그먼트 수는 최소 3개이며 자릿수가 더 많이 필요하면 자동으로 늘어남)

* 최대 지뢰 수 6개, 음수 지뢰 추가(-1~-6), ? 기능 추가

* 그 외 winxp 지뢰찾기를 그대로 배낌

* 3D 지뢰찾기 출시됨:게임-테마에서 3D를 선택하세요(3D 판 생성 가능)

////////////////////////////////////////

See [index.html](index.html) or [Demo][] for usage.

# Notes

* Supports several mines in one cell:
  inspired from [Mines](https://addons.mozilla.org/en-US/firefox/addon/mines/),
  which was the killer app of Firefox 1.0 but is obsolete now.

# See Also

* [Demo][] page uses
  [puzzlet/fake-mswin](http://github.com/puzzlet/fake-mswin/) theme.
* [egraether/mine3D](https://github.com/egraether/mine3D)
* https://duncanacnud.itch.io/omegasweeper

[Demo]: http://hyon3000.github.io/
