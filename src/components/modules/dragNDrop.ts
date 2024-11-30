import SelectionUtils from '../selection';

import Module from '../__module';
/**
 *
 */
export default class DragNDrop extends Module {
  /**
   * If drag has been started at editor, we save it
   * 에디터에서 드래그가 시작되었는지 저장합니다
   *
   * @type {boolean}
   * @private
   */
  private isStartedAtEditor = false;

  /**
   * Toggle read-only state
   * 읽기 전용 상태를 전환합니다
   *
   * if state is true:
   *  - disable all drag-n-drop event handlers
   * 상태가 true인 경우:
   *  - 모든 드래그 앤 드롭 이벤트 핸들러를 비활성화합니다
   *
   * if state is false:
   *  - restore drag-n-drop event handlers
   * 상태가 false인 경우:
   *  - 드래그 앤 드롭 이벤트 핸들러를 복원합니다
   *
   * @param {boolean} readOnlyEnabled - "read only" state
   */
  public toggleReadOnly(readOnlyEnabled: boolean): void {
    if (readOnlyEnabled) {
      this.disableModuleBindings();
    } else {
      this.enableModuleBindings();
    }
  }

  /**
   * Add drag events listeners to editor zone
   * 에디터 영역에 드래그 이벤트 리스너를 추가합니다
   */
  private enableModuleBindings(): void {
    const { UI } = this.Editor;

    this.readOnlyMutableListeners.on(UI.nodes.holder, 'drop', async (dropEvent: DragEvent) => {
      await this.processDrop(dropEvent);
    }, true);

    this.readOnlyMutableListeners.on(UI.nodes.holder, 'dragstart', () => {
      this.processDragStart();
    });

    /**
     * Prevent default browser behavior to allow drop on non-contenteditable elements
     * 비편집 가능한 요소에 드롭을 허용하기 위해 브라우저의 기본 동작을 방지합니다
     */
    this.readOnlyMutableListeners.on(UI.nodes.holder, 'dragover', (dragEvent: DragEvent) => {
      this.processDragOver(dragEvent);
    }, true);
  }

  /**
   * Unbind drag-n-drop event handlers
   * 드래그 앤 드롭 이벤트 핸들러를 바인딩 해제합니다
   */
  private disableModuleBindings(): void {
    this.readOnlyMutableListeners.clearAll();
  }

  /**
   * Handle drop event
   * 드롭 이벤트를 처리합니다
   *
   * @param {DragEvent} dropEvent - drop event
   */
  private async processDrop(dropEvent: DragEvent): Promise<void> {
    const {
      BlockManager,
      Paste,
      Caret,
    } = this.Editor;

    dropEvent.preventDefault();

    BlockManager.blocks.forEach((block) => {
      block.dropTarget = false;
    });

    if (SelectionUtils.isAtEditor && !SelectionUtils.isCollapsed && this.isStartedAtEditor) {
      document.execCommand('delete');
    }

    this.isStartedAtEditor = false;

    /**
     * Try to set current block by drop target.
     * If drop target is not part of the Block, set last Block as current.
     * 드롭 대상으로 현재 블록을 설정하려고 시도합니다.
     * 드롭 대상이 블록의 일부가 아니면, 마지막 블록을 현재 블록으로 설정합니다.
     */
    const targetBlock = BlockManager.setCurrentBlockByChildNode(dropEvent.target as Node);

    if (targetBlock) {
      this.Editor.Caret.setToBlock(targetBlock, Caret.positions.END);
    } else {
      const lastBlock = BlockManager.setCurrentBlockByChildNode(BlockManager.lastBlock.holder);

      this.Editor.Caret.setToBlock(lastBlock, Caret.positions.END);
    }

    await Paste.processDataTransfer(dropEvent.dataTransfer, true);
  }

  /**
   * Handle drag start event
   * 드래그 시작 이벤트를 처리합니다
   */
  private processDragStart(): void {
    if (SelectionUtils.isAtEditor && !SelectionUtils.isCollapsed) {
      this.isStartedAtEditor = true;
    }

    this.Editor.InlineToolbar.close();
  }

  /**
   * @param {DragEvent} dragEvent - drag event
   * 드래그 이벤트를 처리합니다
   */
  private processDragOver(dragEvent: DragEvent): void {
    dragEvent.preventDefault();
  }
}
