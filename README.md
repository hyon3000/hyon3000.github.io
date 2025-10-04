klutzy 지뢰찾기 기반의 로컬에서 동작하는 웹 버전 지뢰찾기 

<img src="/a1.png" alt="a">
<img src="/a3.png" alt="a">
<img src="/a2.png" alt="a">

* <del>매우 많은</del>약간의 버그 수정함
   
* 지능적인 판 생성(찍기 상황 회피) 기능 추가
  * 단 난이도 폭락을 막기 위해 제공되는 찍기 회피 수에는 상한이 있음
  * 일정 수의 칸을 열 때마다 찍기 구제 한 번씩 증가
  * 찍기 구제 1회를 얻기 위해 열어야 하는 칸 수는 칸당 최대 지뢰수(음수 지뢰 최대수+일반 지뢰 최대수)에 반비례
  * 사용한 찍기 구제 횟수는 공개되지 않으며 이 경우 지뢰 칸을 눌렀을 때 해당 칸을 지뢰 없는 칸으로 변경하면서 공개된 정보와 모순이 없도록 지뢰판 수정을 시도함 (생성 불가 시 사망처리)
  * 첫 열기 칸의 지뢰 없음은 위의 구제 횟수와 별개로 반드시 보장함(카운트 x)
  * 가급적 펼치기가 더 많이 가능한 맵을 생성하기 위해 노력(?)함
   
* 초대형 판을 위한 최적화 <del>사실상 다시 짬</del>
  * 최소 1280*720 이상 크기의 판 생성 가능 (실제 상한이 몇인지는 확인해 보지 않음)
  * 지뢰의 최대 개수는 판이 충분히 크다면 무제한임 (세그먼트 수는 최소 3개이며 자릿수가 더 많이 필요하면 자동으로 늘어남)

* 최대 지뢰 수 6개, 음수 지뢰 추가(-1~-6), ? 기능 추가

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
