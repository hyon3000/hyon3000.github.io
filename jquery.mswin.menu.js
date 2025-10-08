(function( $, undefined ) {

$.widget( "mswin.menubar", $.ui.menu, {
    delay: 0,
    zIndex: 100,
    options: $.extend({
        position_toplevel: {
            my: "left top",
            at: "left bottom",
        },
    }, $.ui.menu.options),

    _create: function() {
        $.ui.menu.prototype._create.call(this);
        this._off(this.element, "blur");
        this.element.undelegate(".ui-menu-item", "mouseenter");  // TODO: report jQuery UI's bug in $.widget._off()
        
        // 기존 click 핸들러 제거
        this._off(this.element, "click .ui-menu-item");
        
        this._on({
            "click .ui-menu-item": function( event ) {
                var target = $( event.currentTarget );
                var isTopLevel = target.is(this.element.find("> li"));
                
                target.siblings().children( ".ui-state-active" ).removeClass( "ui-state-active" );
                
                // 최상위 메뉴(게임, 도움말)는 하위 메뉴를 토글
                if ( isTopLevel && target.has( "ul" ).length ) {
                    var submenu = target.children( "ul" );
                    
                    // 이미 열려있으면 닫기
                    if ( target.hasClass( "ui-state-open" ) ) {
                        target.removeClass( "ui-state-open" );
                        this.collapseAll( event );
                    }
                    // 닫혀있으면 열기
                    else {
                        // 다른 열린 메뉴 닫기
                        target.siblings( ".ui-state-open" ).removeClass( "ui-state-open" );
                        this.collapseAll( event );
                        
                        // 포커스 설정 및 ui-state-open 추가
                        this.focus( event, target );
                        target.addClass( "ui-state-open" );
                        
                        // 서브메뉴 열기
                        if ( submenu.length ) {
                            this.expand( event );
                        }
                    }
                }
                // 서브메뉴 항목(하위 메뉴 없음)은 바로 실행
                else if ( !target.has( "ul" ).length ) {
                    this.focus( event, target );
                    this.select( event );
                    
                    // 서브메뉴 항목 실행 후 모든 메뉴 닫기
                    var _this = this;
                    setTimeout(function() {
                        // 모든 최상위 메뉴의 ui-state-open 제거
                        _this.element.find( "> li.ui-state-open" ).removeClass( "ui-state-open" );
                        // 모든 서브메뉴 숨기기
                        _this.element.find( ".ui-menu" ).hide().attr( "aria-hidden", "true" );
                        // 모든 활성 상태 제거
                        _this.element.find( ".ui-state-active, .ui-state-focus, .ui-state-hover" ).removeClass( "ui-state-active ui-state-focus ui-state-hover" );
                        _this.collapseAll( event );
                    }, 0);
                }
            },
            "mouseenter .ui-menu-item": function( event ) {
                var target = $( event.currentTarget );
                var isTopLevel = target.is(this.element.find("> li"));
                
                // 최상위 메뉴는 호버로 열지 않음
                if ( isTopLevel ) {
                    // 하지만 이미 다른 메뉴가 열려있으면, 호버시 전환
                    if ( target.siblings( ".ui-state-open" ).length > 0 && target.has( "ul" ).length ) {
                        // 다른 메뉴 닫기
                        target.siblings( ".ui-state-open" ).removeClass( "ui-state-open" );
                        this.collapseAll( event );
                        
                        // 현재 메뉴 열기
                        this.focus( event, target );
                        target.addClass( "ui-state-open" );
                        this.expand( event );
                    }
                    return;
                }
                
                // 서브메뉴 내에서는 호버로 포커스만 이동
                target.siblings().children( ".ui-state-active" ).removeClass( "ui-state-active" );
                this.focus( event, target );
            },
            blur: function( event ) {
                if ( !$.contains( this.element[0], this.document[0].activeElement ) ) {
                    this.element.find( ".ui-state-open" ).removeClass( "ui-state-open" );
                    this.collapseAll( event );
                }
            },
        });
    },
    
    collapseAll: function( event, all ) {
        // 모든 서브메뉴 닫기
        this.element.find( ".ui-state-open" ).removeClass( "ui-state-open" );
        // 모든 서브메뉴를 명시적으로 숨기기
        this.element.find( ".ui-menu" ).hide().attr( "aria-hidden", "true" );
        // 모든 활성 상태 제거
        this.element.find( ".ui-state-active, .ui-state-focus, .ui-state-hover" ).removeClass( "ui-state-active ui-state-focus ui-state-hover" );
        // 부모 메서드 호출
        $.ui.menu.prototype.collapseAll.call( this, event, all );
    },

    refresh: function() {
        $.ui.menu.prototype.refresh.call(this);
        this.element.find( ".ui-menu-item:has(ul.ui-menu):not(:has(.arrow-wrapper))" )
            .each(function () {
                var menu = $( this );
                menu.prepend($( "<div class='arrow-wrapper'><div class='arrow'></div></div>" ));
            });
    },

    focus: function( event, item ) {
        $.ui.menu.prototype.focus.call( this, event, item );
        // 최상위 메뉴는 클릭으로만 열리도록, focus에서는 ui-state-open을 추가하지 않음
    },

    _open: function( submenu ) {
        var position, zIndex;

        if (submenu.is(this.element.find("ul ul"))) {
            position = $.extend({
                of: this.active
            }, this.options.position );
            var supermenu = this.active.parent("ul");
            zIndex = 1 + supermenu.css("z-index");
        }
        else {
            // top-level menu
            zIndex = this.zIndex;
            position = $.extend({
                of: this.active
            }, this.options.position_toplevel );
        }

        clearTimeout( this.timer );
        this.element.find( ".ui-menu" ).not( submenu.parents( ".ui-menu" ) )
            .hide()
            .attr( "aria-hidden", "true" );

        submenu
            .show() // "slide", { direction: "up" }, 300 )
            .removeAttr( "aria-hidden" )
            .attr( "aria-expanded", "true" )
            .position( position )
            .css( "z-index", zIndex );
    },

});

}( jQuery ));
