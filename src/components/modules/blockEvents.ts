/**
 * Contains keyboard and mouse events bound on each Block by Block Manager
 */
import Module from '../__module';
import * as _ from '../utils';
import SelectionUtils from '../selection';
import Flipper from '../flipper';
import type Block from '../block';
import { areBlocksMergeable } from '../utils/blocks';
import * as caretUtils from '../utils/caret';
import { focus } from '@editorjs/caret';

/**
 *
 */
export default class BlockEvents extends Module {
  /**
   * All keydowns on Block
   * 블록의 모든 키 다운 이벤트
   *
   * @param {KeyboardEvent} event - keydown
   */
  public keydown(event: KeyboardEvent): void {
    /**
     * Run common method for all keydown events
     * 모든 키 다운 이벤트에 대한 공통 메서드 실행
     */
    this.beforeKeydownProcessing(event);

    /**
     * Fire keydown processor by event.keyCode
     * event.keyCode에 따라 키 다운 프로세서 실행
     */
    switch (event.keyCode) {
      case _.keyCodes.BACKSPACE:
        this.backspace(event);
        break;

      case _.keyCodes.DELETE:
        this.delete(event);
        break;

      case _.keyCodes.ENTER:
        this.enter(event);
        break;

      case _.keyCodes.DOWN:
      case _.keyCodes.RIGHT:
        this.arrowRightAndDown(event);
        break;

      case _.keyCodes.UP:
      case _.keyCodes.LEFT:
        this.arrowLeftAndUp(event);
        break;

      case _.keyCodes.TAB:
        this.tabPressed(event);
        break;
    }

    /**
     * We check for "key" here since on different keyboard layouts "/" can be typed as "Shift + 7" etc
     * 여기서 "key"를 확인하는 이유는 다른 키보드 레이아웃에서 "/"가 "Shift + 7" 등으로 입력될 수 있기 때문입니다
     *
     * @todo probably using "beforeInput" event would be better here
     * @todo "beforeInput" 이벤트를 사용하는 것이 여기서 더 좋을 것 같습니다
     */
    if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
      this.slashPressed(event);
    }

    /**
     * If user pressed "Ctrl + /" or "Cmd + /" — open Block Settings
     * We check for "code" here since on different keyboard layouts there can be different keys in place of Slash.
     * 
     * 사용자가 "Ctrl + /" 또는 "Cmd + /"를 누르면 블록 설정 열기
     * 다른 키보드 레이아웃에서는 슬래시 대신 다른 키가 있을 수 있으므로 "code"를 확인합니다.
     */
    if (event.code === 'Slash' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.commandSlashPressed();
    }
  }

  /**
   * Fires on keydown before event processing
   * 이벤트 처리 전 키 다운 시 발생
   *
   * @param {KeyboardEvent} event - keydown
   */
  public beforeKeydownProcessing(event: KeyboardEvent): void {
    /**
     * Do not close Toolbox on Tabs or on Enter with opened Toolbox
     * 탭이나 열린 툴박스에서 엔터키를 누를 때 툴박스를 닫지 않습니다
     */
    if (!this.needToolbarClosing(event)) {
      return;
    }

    /**
     * When user type something:
     *  - close Toolbar
     *  - clear block highlighting
     * 
     * 사용자가 무언가를 입력할 때:
     *  - 툴바 닫기
     *  - 블록 하이라이트 지우기
     */
    if (_.isPrintableKey(event.keyCode)) {
      this.Editor.Toolbar.close();

      /**
       * Allow to use shortcuts with selected blocks
       * 선택된 블록으로 단축키 사용 허용
       *
       * @type {boolean}
       */
      const isShortcut = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;

      if (!isShortcut) {
        this.Editor.BlockSelection.clearSelection(event);
      }
    }
  }

  /**
   * Key up on Block:
   * - shows Inline Toolbar if something selected
   * - shows conversion toolbar with 85% of block selection
   * 
   * 블록의 키 업:
   * - 무언가 선택되면 인라인 툴바 표시
   * - 블록 선택의 85%로 변환 툴바 표시
   *
   * @param {KeyboardEvent} event - keyup event
   */
  public keyup(event: KeyboardEvent): void {
    /**
     * If shift key was pressed some special shortcut is used (eg. cross block selection via shift + arrows)
     * Shift 키가 눌렸다면 특별한 단축키가 사용됨 (예: Shift + 화살표로 블록 간 선택)
     */
    if (event.shiftKey) {
      return;
    }

    /**
     * Check if editor is empty on each keyup and add special css class to wrapper
     * 각 키 업마다 에디터가 비어있는지 확인하고 래퍼에 특별한 CSS 클래스 추가
     */
    this.Editor.UI.checkEmptiness();
  }

  /**
   * Add drop target styles
   * 드롭 대상 스타일 추가
   *
   * @param {DragEvent} event - drag over event
   */
  public dragOver(event: DragEvent): void {
    const block = this.Editor.BlockManager.getBlockByChildNode(event.target as Node);

    block.dropTarget = true;
  }

  /**
   * Remove drop target style
   * 드롭 대상 스타일 제거
   *
   * @param {DragEvent} event - drag leave event
   */
  public dragLeave(event: DragEvent): void {
    const block = this.Editor.BlockManager.getBlockByChildNode(event.target as Node);

    block.dropTarget = false;
  }

  /**
   * Copying selected blocks
   * Before putting to the clipboard we sanitize all blocks and then copy to the clipboard
   * 
   * 선택된 블록 복사
   * 클립보드에 넣기 전에 모든 블록을 정리하고 클립보드에 복사
   *
   * @param {ClipboardEvent} event - clipboard event
   */
  public handleCommandC(event: ClipboardEvent): void {
    const { BlockSelection } = this.Editor;

    if (!BlockSelection.anyBlockSelected) {
      return;
    }

    // Copy Selected Blocks
    BlockSelection.copySelectedBlocks(event);
  }

  /**
   * Copy and Delete selected Blocks
   * 선택된 블록 복사 및 삭제
   *
   * @param {ClipboardEvent} event - clipboard event
   */
  public handleCommandX(event: ClipboardEvent): void {
    const { BlockSelection, BlockManager, Caret } = this.Editor;

    if (!BlockSelection.anyBlockSelected) {
      return;
    }

    BlockSelection.copySelectedBlocks(event).then(() => {
      const selectionPositionIndex = BlockManager.removeSelectedBlocks();

      /**
       * Insert default block in place of removed ones
       * 제거된 블록 위치에 기본 블록 삽입
       */
      const insertedBlock = BlockManager.insertDefaultBlockAtIndex(selectionPositionIndex, true);

      Caret.setToBlock(insertedBlock, Caret.positions.START);

      /** Clear selection */
      BlockSelection.clearSelection(event);
    });
  }

  /**
   * Tab pressed inside a Block.
   *
   * 블록 내에서 탭 키를 눌렀을 때
   *
   * @param {KeyboardEvent} event - keydown
   */
  private tabPressed(event: KeyboardEvent): void {
    const { InlineToolbar, Caret } = this.Editor;

    const isFlipperActivated = InlineToolbar.opened;

    if (isFlipperActivated) {
      return;
    }

    const isNavigated = event.shiftKey ? Caret.navigatePrevious(true) : Caret.navigateNext(true);

    /**
     * If we have next Block/input to focus, then focus it. Otherwise, leave native Tab behaviour
     */
    if (isNavigated) {
      event.preventDefault();
    }
  }

  /**
   * '/' + 'command' keydown inside a Block
   */
  private commandSlashPressed(): void {
    if (this.Editor.BlockSelection.selectedBlocks.length > 1) {
      return;
    }

    this.activateBlockSettings();
  }

  /**
   * '/' keydown inside a Block
   *
   * 블록 내에서 '/' 키를 눌렀을 때
   *
   * @param event - keydown
   */
  private slashPressed(event: KeyboardEvent): void {
    const currentBlock = this.Editor.BlockManager.currentBlock;
    const canOpenToolbox = currentBlock.isEmpty;

    /**
     * @todo Handle case when slash pressed when several blocks are selected
     */

    /**
     * Toolbox will be opened only if Block is empty
     */
    if (!canOpenToolbox) {
      return;
    }

    /**
     * The Toolbox will be opened with immediate focus on the Search input,
     * and '/' will be added in the search input by default — we need to prevent it and add '/' manually
     */
    event.preventDefault();
    this.Editor.Caret.insertContentAtCaretPosition('/');

    this.activateToolbox();
  }

  /**
   * ENTER pressed on block
   *
   * 블록에서 엔터 키를 눌렀을 때
   *
   * @param {KeyboardEvent} event - keydown
   */
  private enter(event: KeyboardEvent): void {
    const { BlockManager, UI } = this.Editor;
    const currentBlock = BlockManager.currentBlock;

    if (currentBlock === undefined) {
      return;
    }

    /**
     * Don't handle Enter keydowns when Tool sets enableLineBreaks to true.
     * Uses for Tools like <code> where line breaks should be handled by default behaviour.
     */
    if (currentBlock.tool.isLineBreaksEnabled) {
      return;
    }

    /**
     * Opened Toolbars uses Flipper with own Enter handling
     * Allow split block when no one button in Flipper is focused
     */
    if (UI.someToolbarOpened && UI.someFlipperButtonFocused) {
      return;
    }

    /**
     * Allow to create line breaks by Shift+Enter
     *
     * Note. On iOS devices, Safari automatically treats enter after a period+space (". |") as Shift+Enter
     * (it used for capitalizing of the first letter of the next sentence)
     * We don't need to lead soft line break in this case — new block should be created
     */
    if (event.shiftKey && !_.isIosDevice) {
      return;
    }

    let blockToFocus = currentBlock;

    /**
     * If enter has been pressed at the start of the text, just insert paragraph Block above
     */
    if (currentBlock.currentInput !== undefined && caretUtils.isCaretAtStartOfInput(currentBlock.currentInput) && !currentBlock.hasMedia) {
      this.Editor.BlockManager.insertDefaultBlockAtIndex(this.Editor.BlockManager.currentBlockIndex);

    /**
     * If caret is at very end of the block, just append the new block without splitting
     * to prevent unnecessary dom mutation observing
     */
    } else if (currentBlock.currentInput && caretUtils.isCaretAtEndOfInput(currentBlock.currentInput)) {
      blockToFocus = this.Editor.BlockManager.insertDefaultBlockAtIndex(this.Editor.BlockManager.currentBlockIndex + 1);
    } else {
      /**
       * Split the Current Block into two blocks
       * Renew local current node after split
       */
      blockToFocus = this.Editor.BlockManager.split();
    }

    this.Editor.Caret.setToBlock(blockToFocus);

    /**
     * Show Toolbar
     */
    this.Editor.Toolbar.moveAndOpen(blockToFocus);

    event.preventDefault();
  }

  /**
   * Handle backspace keydown on Block
   *
   * 블록에서 백스페이스 키를 눌렀을 때
   *
   * @param {KeyboardEvent} event - keydown
   */
  private backspace(event: KeyboardEvent): void {
    const { BlockManager, Caret } = this.Editor;
    const { currentBlock, previousBlock } = BlockManager;

    if (currentBlock === undefined) {
      return;
    }

    /**
     * If some fragment is selected, leave native behaviour
     */
    if (!SelectionUtils.isCollapsed) {
      return;
    }

    /**
     * If caret is not at the start, leave native behaviour
     */
    if (!currentBlock.currentInput || !caretUtils.isCaretAtStartOfInput(currentBlock.currentInput)) {
      return;
    }
    /**
     * All the cases below have custom behaviour, so we don't need a native one
     */
    event.preventDefault();
    this.Editor.Toolbar.close();

    const isFirstInputFocused = currentBlock.currentInput === currentBlock.firstInput;

    /**
     * For example, caret at the start of the Quote second input (caption) — just navigate previous input
     */
    if (!isFirstInputFocused) {
      Caret.navigatePrevious();

      return;
    }

    /**
     * Backspace at the start of the first Block should do nothing
     */
    if (previousBlock === null) {
      return;
    }

    /**
     * If prev Block is empty, it should be removed just like a character
     */
    if (previousBlock.isEmpty) {
      BlockManager.removeBlock(previousBlock);

      return;
    }

    /**
     * If current Block is empty, just remove it and set cursor to the previous Block (like we're removing line break char)
     */
    if (currentBlock.isEmpty) {
      BlockManager.removeBlock(currentBlock);

      const newCurrentBlock = BlockManager.currentBlock;

      Caret.setToBlock(newCurrentBlock, Caret.positions.END);

      return;
    }

    const bothBlocksMergeable = areBlocksMergeable(previousBlock, currentBlock);

    /**
     * If Blocks could be merged, do it
     * Otherwise, just navigate previous block
     */
    if (bothBlocksMergeable) {
      this.mergeBlocks(previousBlock, currentBlock);
    } else {
      Caret.setToBlock(previousBlock, Caret.positions.END);
    }
  }

  /**
   * Handles delete keydown on Block
   * Removes char after the caret.
   * If caret is at the end of the block, merge next block with current
   *
   * 블록에서 삭제 키를 눌렀을 때
   * 커서 뒤의 문자를 삭제합니다.
   * 커서가 블록의 끝에 있는 경우, 다음 블록을 현재 블록과 병합합니다.
   *
   * @param {KeyboardEvent} event - keydown
   */
  private delete(event: KeyboardEvent): void {
    const { BlockManager, Caret } = this.Editor;
    const { currentBlock, nextBlock } = BlockManager;

    /**
     * If some fragment is selected, leave native behaviour
     */
    if (!SelectionUtils.isCollapsed) {
      return;
    }

    /**
     * If caret is not at the end, leave native behaviour
     */
    if (!caretUtils.isCaretAtEndOfInput(currentBlock.currentInput)) {
      return;
    }

    /**
     * All the cases below have custom behaviour, so we don't need a native one
     */
    event.preventDefault();
    this.Editor.Toolbar.close();

    const isLastInputFocused = currentBlock.currentInput === currentBlock.lastInput;

    /**
     * For example, caret at the end of the Quote first input (quote text) — just navigate next input (caption)
     */
    if (!isLastInputFocused) {
      Caret.navigateNext();

      return;
    }

    /**
     * Delete at the end of the last Block should do nothing
     */
    if (nextBlock === null) {
      return;
    }

    /**
     * If next Block is empty, it should be removed just like a character
     */
    if (nextBlock.isEmpty) {
      BlockManager.removeBlock(nextBlock);

      return;
    }

    /**
     * If current Block is empty, just remove it and set cursor to the next Block (like we're removing line break char)
     */
    if (currentBlock.isEmpty) {
      BlockManager.removeBlock(currentBlock);

      Caret.setToBlock(nextBlock, Caret.positions.START);

      return;
    }

    const bothBlocksMergeable = areBlocksMergeable(currentBlock, nextBlock);

    /**
     * If Blocks could be merged, do it
     * Otherwise, just navigate to the next block
     */
    if (bothBlocksMergeable) {
      this.mergeBlocks(currentBlock, nextBlock);
    } else {
      Caret.setToBlock(nextBlock, Caret.positions.START);
    }
  }

  /**
   * Merge passed Blocks
   *
   * 블록 병합
   *
   * @param targetBlock - to which Block we want to merge
   * @param blockToMerge - what Block we want to merge
   */
  private mergeBlocks(targetBlock: Block, blockToMerge: Block): void {
    const { BlockManager, Toolbar } = this.Editor;

    if (targetBlock.lastInput === undefined) {
      return;
    }

    focus(targetBlock.lastInput, false);

    BlockManager
      .mergeBlocks(targetBlock, blockToMerge)
      .then(() => {
        Toolbar.close();
      });
  }

  /**
   * Handle right and down keyboard keys
   *
   * 오른쪽 및 아래쪽 키보드 키 처리
   *
   * @param {KeyboardEvent} event - keyboard event
   */
  private arrowRightAndDown(event: KeyboardEvent): void {
    const isFlipperCombination = Flipper.usedKeys.includes(event.keyCode) &&
      (!event.shiftKey || event.keyCode === _.keyCodes.TAB);

    /**
     * Arrows might be handled on toolbars by flipper
     * Check for Flipper.usedKeys to allow navigate by DOWN and disallow by RIGHT
     */
    if (this.Editor.UI.someToolbarOpened && isFlipperCombination) {
      return;
    }

    /**
     * Close Toolbar when user moves cursor
     */
    this.Editor.Toolbar.close();

    const { currentBlock } = this.Editor.BlockManager;
    const caretAtEnd = currentBlock?.currentInput !== undefined ? caretUtils.isCaretAtEndOfInput(currentBlock.currentInput) : undefined;
    const shouldEnableCBS = caretAtEnd || this.Editor.BlockSelection.anyBlockSelected;

    if (event.shiftKey && event.keyCode === _.keyCodes.DOWN && shouldEnableCBS) {
      this.Editor.CrossBlockSelection.toggleBlockSelectedState();

      return;
    }

    const navigateNext = event.keyCode === _.keyCodes.DOWN || (event.keyCode === _.keyCodes.RIGHT && !this.isRtl);
    const isNavigated = navigateNext ? this.Editor.Caret.navigateNext() : this.Editor.Caret.navigatePrevious();

    if (isNavigated) {
      /**
       * Default behaviour moves cursor by 1 character, we need to prevent it
       */
      event.preventDefault();

      return;
    }

    /**
     * After caret is set, update Block input index
     */
    _.delay(() => {
      /** Check currentBlock for case when user moves selection out of Editor */
      if (this.Editor.BlockManager.currentBlock) {
        this.Editor.BlockManager.currentBlock.updateCurrentInput();
      }
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    }, 20)();

    /**
     * Clear blocks selection by arrows
     */
    this.Editor.BlockSelection.clearSelection(event);
  }

  /**
   * Handle left and up keyboard keys
   *
   * 왼쪽 및 위쪽 키보드 키 처리
   *
   * @param {KeyboardEvent} event - keyboard event
   */
  private arrowLeftAndUp(event: KeyboardEvent): void {
    /**
     * Arrows might be handled on toolbars by flipper
     * Check for Flipper.usedKeys to allow navigate by UP and disallow by LEFT
     */
    if (this.Editor.UI.someToolbarOpened) {
      if (Flipper.usedKeys.includes(event.keyCode) && (!event.shiftKey || event.keyCode === _.keyCodes.TAB)) {
        return;
      }

      this.Editor.UI.closeAllToolbars();
    }

    /**
     * Close Toolbar when user moves cursor
     */
    this.Editor.Toolbar.close();

    const { currentBlock } = this.Editor.BlockManager;
    const caretAtStart = currentBlock?.currentInput !== undefined ? caretUtils.isCaretAtStartOfInput(currentBlock.currentInput) : undefined;
    const shouldEnableCBS = caretAtStart || this.Editor.BlockSelection.anyBlockSelected;

    if (event.shiftKey && event.keyCode === _.keyCodes.UP && shouldEnableCBS) {
      this.Editor.CrossBlockSelection.toggleBlockSelectedState(false);

      return;
    }

    const navigatePrevious = event.keyCode === _.keyCodes.UP || (event.keyCode === _.keyCodes.LEFT && !this.isRtl);
    const isNavigated = navigatePrevious ? this.Editor.Caret.navigatePrevious() : this.Editor.Caret.navigateNext();

    if (isNavigated) {
      /**
       * Default behaviour moves cursor by 1 character, we need to prevent it
       */
      event.preventDefault();

      return;
    }

    /**
     * After caret is set, update Block input index
     */
    _.delay(() => {
      /** Check currentBlock for case when user ends selection out of Editor and then press arrow-key */
      if (this.Editor.BlockManager.currentBlock) {
        this.Editor.BlockManager.currentBlock.updateCurrentInput();
      }
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    }, 20)();

    /**
     * Clear blocks selection by arrows
     */
    this.Editor.BlockSelection.clearSelection(event);
  }

  /**
   * Cases when we need to close Toolbar
   *
   * 툴바를 닫아야 하는 경우
   *
   * @param {KeyboardEvent} event - keyboard event
   */
  private needToolbarClosing(event: KeyboardEvent): boolean {
    const toolboxItemSelected = (event.keyCode === _.keyCodes.ENTER && this.Editor.Toolbar.toolbox.opened),
        blockSettingsItemSelected = (event.keyCode === _.keyCodes.ENTER && this.Editor.BlockSettings.opened),
        inlineToolbarItemSelected = (event.keyCode === _.keyCodes.ENTER && this.Editor.InlineToolbar.opened),
        flippingToolbarItems = event.keyCode === _.keyCodes.TAB;

    /**
     * Do not close Toolbar in cases:
     * 1. ShiftKey pressed (or combination with shiftKey)
     * 2. When Toolbar is opened and Tab leafs its Tools
     * 3. When Toolbar's component is opened and some its item selected
     */
    return !(event.shiftKey ||
      flippingToolbarItems ||
      toolboxItemSelected ||
      blockSettingsItemSelected ||
      inlineToolbarItemSelected
    );
  }

  /**
   * If Toolbox is not open, then just open it and show plus button
   */
  private activateToolbox(): void {
    if (!this.Editor.Toolbar.opened) {
      this.Editor.Toolbar.moveAndOpen();
    } // else Flipper will leaf through it

    this.Editor.Toolbar.toolbox.open();
  }

  /**
   * Open Toolbar and show BlockSettings before flipping Tools
   */
  private activateBlockSettings(): void {
    if (!this.Editor.Toolbar.opened) {
      this.Editor.Toolbar.moveAndOpen();
    }

    /**
     * If BlockSettings is not open, then open BlockSettings
     * Next Tab press will leaf Settings Buttons
     */
    if (!this.Editor.BlockSettings.opened) {
      /**
       * @todo Debug the case when we set caret to some block, hovering another block
       *       — wrong settings will be opened.
       *       To fix it, we should refactor the Block Settings module — make it a standalone class, like the Toolbox
       */
      this.Editor.BlockSettings.open();
    }
  }
}
