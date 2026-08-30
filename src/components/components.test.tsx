import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VirtualList from './VirtualList'
import { ConfirmIconButton, ConfirmTextButton } from './ConfirmButtons'
import ImportDialog from '../views/ImportDialog'
import BorderGlow from './BorderGlow'

describe('VirtualList', () => {
  const fruits = ['apple', 'banana', 'cherry', 'date', 'fig', 'grape']
  const getKey = (item: string) => item

  it('renders every item when the list fits the viewport and selects on click', () => {
    const onItemSelect = vi.fn()
    render(
      <VirtualList items={fruits} getItemKey={getKey} renderItem={(item) => <span>{item}</span>} onItemSelect={onItemSelect} />,
    )
    for (const fruit of fruits) expect(screen.getByText(fruit)).toBeInTheDocument()
    fireEvent.click(screen.getByText('banana'))
    expect(onItemSelect).toHaveBeenCalledWith('banana')
  })

  it('supports arrow navigation and enter selection from the container', () => {
    const onItemSelect = vi.fn()
    const { container } = render(
      <VirtualList items={fruits} getItemKey={getKey} renderItem={(item) => <span>{item}</span>} onItemSelect={onItemSelect} />,
    )
    const scroller = container.querySelector('.scroll-list') as HTMLElement
    fireEvent.keyDown(scroller, { key: 'ArrowDown' })
    fireEvent.keyDown(scroller, { key: 'ArrowDown' })
    fireEvent.keyDown(scroller, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('banana')
  })

  it('ignores keyboard events originating from inner buttons', () => {
    const onItemSelect = vi.fn()
    render(
      <VirtualList
        items={fruits}
        getItemKey={getKey}
        renderItem={(item) => <span><button type="button">{item}</button></span>}
        onItemSelect={onItemSelect}
      />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'apple' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'apple' }), { key: 'Enter' })
    expect(onItemSelect).not.toHaveBeenCalled()
  })

  it('only renders the visible window after scrolling', () => {
    const many = Array.from({ length: 100 }, (_, index) => `item-${index}`)
    const { container } = render(
      <VirtualList items={many} getItemKey={getKey} rowHeight={50} renderItem={(item) => <span>{item}</span>} />,
    )
    const scroller = container.querySelector('.scroll-list') as HTMLElement
    expect(container.querySelectorAll('.virtual-row').length).toBeLessThan(100)
    scroller.scrollTop = 2000
    fireEvent.scroll(scroller)
    expect(container.querySelectorAll('.virtual-row').length).toBeLessThan(100)
    expect(screen.queryByText('item-0')).not.toBeInTheDocument()
    expect(screen.getByText('item-40')).toBeInTheDocument()
    expect((container.querySelector('.virtual-spacer') as HTMLElement).style.height).toBe('5000px')
  })
})

describe('ConfirmButtons', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('requires a second click before confirming and resets after timeout', () => {
    const onConfirm = vi.fn()
    render(<ConfirmIconButton label="删除表" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: '删除表' }))
    expect(onConfirm).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2900)
    })
    const reArmed = screen.getByRole('button', { name: '删除表' })
    fireEvent.click(reArmed)
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '再点一次确认：删除表' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('ConfirmTextButton shows an explicit confirmation label', () => {
    const onConfirm = vi.fn()
    render(<ConfirmTextButton label="删除此表" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /删除此表/ }))
    fireEvent.click(screen.getByRole('button', { name: /再点一次，确认删除/ }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

describe('ImportDialog', () => {
  const baseProps = {
    importing: false,
    inspecting: false,
    progress: 0,
    error: '',
    file: null,
    sheets: [],
    selectedSheets: [],
    mode: 'ddl' as const,
    onModeChange: vi.fn(),
    ddlText: '',
    onDdlTextChange: vi.fn(),
    ddlName: '',
    onDdlNameChange: vi.fn(),
    onDdlConfirm: vi.fn(),
    fileInputRef: { current: null },
    onClose: vi.fn(),
    onFileChange: vi.fn(),
    onToggleSheet: vi.fn(),
    onConfirm: vi.fn(),
  }

  it('disables the DDL confirm button until text is pasted', () => {
    const { rerender } = render(<ImportDialog {...baseProps} />)
    expect(screen.getByTestId('ddl-confirm')).toBeDisabled()
    rerender(<ImportDialog {...baseProps} ddlText="CREATE TABLE t (id int);" importing />)
    expect(screen.getByTestId('ddl-confirm')).toBeDisabled()
    expect(screen.getByTestId('import-progress')).toBeInTheDocument()
  })

  it('confirms the DDL import and reports parse errors', () => {
    const onDdlConfirm = vi.fn()
    const { rerender } = render(<ImportDialog {...baseProps} ddlText="CREATE TABLE t (id int);" onDdlConfirm={onDdlConfirm} />)
    fireEvent.click(screen.getByTestId('ddl-confirm'))
    expect(onDdlConfirm).toHaveBeenCalledOnce()
    rerender(<ImportDialog {...baseProps} ddlText="CREATE TABLE t (id int);" error="未识别语句" />)
    expect(screen.getByText('未识别语句')).toBeInTheDocument()
  })

  it('lists workbook sheets, toggles selection and gates the confirm button', () => {
    const onToggleSheet = vi.fn()
    const sheets = [
      { name: '数据字典', rowCount: 10, preview: [['表中文名']], likelyRevision: false },
      { name: '修订记录', rowCount: 4, preview: [['表名']], likelyRevision: true },
    ]
    render(
      <ImportDialog
        {...baseProps}
        mode="excel"
        file={new File(['workbook'], 'dp_ial.xlsx')}
        sheets={sheets}
        selectedSheets={['数据字典']}
        onToggleSheet={onToggleSheet}
      />,
    )
    expect(screen.getByTestId('sheet-list')).toBeInTheDocument()
    expect(screen.getByText(/修订记录（默认跳过）/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('数据字典'))
    expect(onToggleSheet).toHaveBeenCalledWith('数据字典')
    expect(screen.getByRole('button', { name: '导入选中 Sheet' })).toBeEnabled()
  })

  it('closes from the dialog header', () => {
    const onClose = vi.fn()
    render(<ImportDialog {...baseProps} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('关闭'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('BorderGlow', () => {
  it('renders children inside the glow frame', () => {
    render(
      <BorderGlow backgroundColor="#fff" borderRadius={8}>
        <span>drop here</span>
      </BorderGlow>,
    )
    expect(screen.getByText('drop here')).toBeInTheDocument()
  })
})
