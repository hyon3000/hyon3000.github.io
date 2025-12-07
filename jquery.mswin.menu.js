(function ($, undefined) {

    $.widget("mswin.menubar", $.ui.menu, {
        delay: 0,
        zIndex: 100,
        options: $.extend({
            position_toplevel: {
                my: "left top",
                at: "left bottom",
            },
        }, $.ui.menu.options),

        _create: function () {
            $.ui.menu.prototype._create.call(this);

            // --- [수정됨] 마우스 이탈로 인한 닫힘 방지 코드 시작 ---

            // 1. 상속받은 blur 이벤트 제거 (포커스 잃을 때 닫힘 방지 제어)
            this._off(this.element, "blur");

            // 2. 상속받은 mouseenter 제거 (기존 코드 유지)
            this.element.undelegate(".ui-menu-item", "mouseenter");

            // 3. 상속받은 click 핸들러 제거 (기존 코드 유지)
            this._off(this.element, "click .ui-menu-item");

            // 4. ★ 핵심: 마우스가 메뉴 밖으로 나갈 때(mouseleave) 닫히는 기능 강제 제거 ★
            // 상위 위젯($.ui.menu)이 바인딩한 이벤트를 모두 해제합니다.
            this._off(this.element, "mouseleave");
            this.element.unbind("mouseleave");
            this.element.undelegate(".ui-menu-item", "mouseleave");

            // --- [수정됨] 끝 ---

            this._on({
                "click .ui-menu-item": function (event) {
                    var target = $(event.currentTarget);
                    var isTopLevel = target.is(this.element.find("> li"));

                    target.siblings().children(".ui-state-active").removeClass("ui-state-active");

                    // 최상위 메뉴(게임, 도움말)는 하위 메뉴를 토글
                    if (isTopLevel && target.has("ul").length) {
                        var submenu = target.children("ul");

                        // 이미 열려있으면 닫기
                        if (target.hasClass("ui-state-open")) {
                            target.removeClass("ui-state-open");
                            this.collapseAll(event);
                        }
                        // 닫혀있으면 열기
                        else {
                            // 다른 열린 메뉴 닫기
                            target.siblings(".ui-state-open").removeClass("ui-state-open");
                            this.collapseAll(event);

                            // 포커스 설정 및 ui-state-open 추가
                            this.focus(event, target);
                            target.addClass("ui-state-open");

                            // 서브메뉴 열기
                            if (submenu.length) {
                                this.expand(event);
                            }
                        }
                    }
                    // "기타"와 같이 최상위는 아니지만 하위 메뉴가 있는 경우 처리 (클릭 시 열림 유지)
                    else if (target.has("ul").length) {
                        this.focus(event, target);
                        this.expand(event);
                    }
                    // 최종 항목(하위 메뉴 없음)은 실행 후 닫기
                    else {
                        this.focus(event, target);
                        this.select(event);

                        // 서브메뉴 항목 실행 후 모든 메뉴 닫기
                        var _this = this;
                        setTimeout(function () {
                            // 모든 최상위 메뉴의 ui-state-open 제거
                            _this.element.find("> li.ui-state-open").removeClass("ui-state-open");
                            // 모든 서브메뉴 숨기기
                            _this.element.find(".ui-menu").hide().attr("aria-hidden", "true");
                            // 모든 활성 상태 제거
                            _this.element.find(".ui-state-active, .ui-state-focus, .ui-state-hover").removeClass("ui-state-active ui-state-focus ui-state-hover");
                            _this.collapseAll(event);
                        }, 0);
                    }
                },
                "mouseenter .ui-menu-item": function (event) {
                    var target = $(event.currentTarget);
                    var isTopLevel = target.is(this.element.find("> li"));

                    // 최상위 메뉴는 호버로 열지 않음 (클릭해야 열림)
                    if (isTopLevel) {
                        // 하지만 이미 다른 메뉴가 열려있으면, 호버시 전환 (Windows 98 스타일)
                        if (target.siblings(".ui-state-open").length > 0 && target.has("ul").length) {
                            // 다른 메뉴 닫기
                            target.siblings(".ui-state-open").removeClass("ui-state-open");
                            this.collapseAll(event);

                            // 현재 메뉴 열기
                            this.focus(event, target);
                            target.addClass("ui-state-open");
                            this.expand(event);
                        }
                        return;
                    }

                    // 서브메뉴 내에서는 호버로 포커스만 이동 (닫지 않음)
                    target.siblings().children(".ui-state-active").removeClass("ui-state-active");
                    this.focus(event, target);

                    // 하위 메뉴가 있다면 호버 시 자동으로 펼침
                    if (target.has("ul").length) {
                        this.expand(event);
                    }
                },
                // blur: 포커스를 잃었을 때(외부 클릭 등)만 닫힘
                blur: function (event) {
                    if (!$.contains(this.element[0], this.document[0].activeElement)) {
                        this.element.find(".ui-state-open").removeClass("ui-state-open");
                        this.collapseAll(event);
                    }
                },
            });
        },

        collapseAll: function (event, all) {
            // 모든 서브메뉴 닫기
            this.element.find(".ui-state-open").removeClass("ui-state-open");
            // 모든 서브메뉴를 명시적으로 숨기기
            this.element.find(".ui-menu").hide().attr("aria-hidden", "true");
            // 모든 활성 상태 제거
            this.element.find(".ui-state-active, .ui-state-focus, .ui-state-hover").removeClass("ui-state-active ui-state-focus ui-state-hover");
            // 부모 메서드 호출
            $.ui.menu.prototype.collapseAll.call(this, event, all);
        },

        refresh: function () {
            $.ui.menu.prototype.refresh.call(this);
            this.element.find(".ui-menu-item:has(ul.ui-menu):not(:has(.arrow-wrapper))")
                .each(function () {
                    var menu = $(this);
                    menu.prepend($("<div class='arrow-wrapper'><div class='arrow'></div></div>"));
                });
        },

        focus: function (event, item) {
            $.ui.menu.prototype.focus.call(this, event, item);
            // 최상위 메뉴는 클릭으로만 열리도록, focus에서는 ui-state-open을 추가하지 않음
        },

        _open: function (submenu) {
            var position, zIndex;

            if (submenu.is(this.element.find("ul ul"))) {
                position = $.extend({
                    of: this.active
                }, this.options.position);
                var supermenu = this.active.parent("ul");
                zIndex = 1 + supermenu.css("z-index");
            }
            else {
                // top-level menu
                zIndex = this.zIndex;
                position = $.extend({
                    of: this.active
                }, this.options.position_toplevel);
            }

            clearTimeout(this.timer);
            this.element.find(".ui-menu").not(submenu.parents(".ui-menu"))
                .hide()
                .attr("aria-hidden", "true");

            submenu
                .show() // "slide", { direction: "up" }, 300 )
                .removeAttr("aria-hidden")
                .attr("aria-expanded", "true")
                .position(position)
                .css("z-index", zIndex);
        },

    });

}(jQuery));