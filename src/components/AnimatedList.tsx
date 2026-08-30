import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEventHandler,
  type ReactNode,
  type UIEvent,
} from 'react'
import { motion, useInView } from 'motion/react'
import './AnimatedList.css'

interface AnimatedItemProps {
  children: ReactNode
  delay?: number
  index: number
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  onClick?: MouseEventHandler<HTMLDivElement>
}

const AnimatedItem = ({ children, delay = 0, index, onMouseEnter, onClick }: AnimatedItemProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.5, once: false })
  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 }}
      transition={{ duration: 0.2, delay }}
      style={{ marginBottom: '0.55rem', cursor: 'pointer' }}
    >
      {children}
    </motion.div>
  )
}

export interface AnimatedListProps<T = string> {
  items?: T[]
  onItemSelect?: (item: T, index: number) => void
  showGradients?: boolean
  enableArrowNavigation?: boolean
  className?: string
  itemClassName?: string
  displayScrollbar?: boolean
  initialSelectedIndex?: number
  renderItem?: (item: T, selected: boolean) => ReactNode
  footer?: ReactNode
  keyboardTarget?: 'global' | 'container'
}

function AnimatedList<T>({
  items = [],
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  className = '',
  itemClassName = '',
  displayScrollbar = true,
  initialSelectedIndex = -1,
  renderItem,
  footer,
  keyboardTarget = 'global',
}: AnimatedListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState<number>(initialSelectedIndex)
  const [keyboardNav, setKeyboardNav] = useState<boolean>(false)
  const [topGradientOpacity, setTopGradientOpacity] = useState<number>(0)
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState<number>(1)

  const handleItemMouseEnter = useCallback((index: number) => {
    setSelectedIndex(index)
  }, [])

  const handleItemClick = useCallback(
    (item: T, index: number) => {
      setSelectedIndex(index)
      if (onItemSelect) onItemSelect(item, index)
    },
    [onItemSelect],
  )

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    const { scrollTop, scrollHeight, clientHeight } = target
    setTopGradientOpacity(Math.min(scrollTop / 50, 1))
    const bottomDistance = scrollHeight - (scrollTop + clientHeight)
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1))
  }, [])

  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement> | KeyboardEvent) => {
    const key = e.key
    if (key === 'ArrowDown' || (key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      setKeyboardNav(true)
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1))
    } else if (key === 'ArrowUp' || (key === 'Tab' && e.shiftKey)) {
      e.preventDefault()
      setKeyboardNav(true)
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < items.length) {
        e.preventDefault()
        if (onItemSelect) onItemSelect(items[selectedIndex], selectedIndex)
      }
    }
  }, [items, selectedIndex, onItemSelect])

  useEffect(() => {
    if (!enableArrowNavigation || keyboardTarget !== 'global') return
    const listener = (e: KeyboardEvent) => handleKeyDown(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [enableArrowNavigation, keyboardTarget, handleKeyDown])

  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) return
    const container = listRef.current
    const selectedItem = container.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null
    if (selectedItem) {
      const extraMargin = 50
      const containerScrollTop = container.scrollTop
      const containerHeight = container.clientHeight
      const itemTop = selectedItem.offsetTop
      const itemBottom = itemTop + selectedItem.offsetHeight
      if (itemTop < containerScrollTop + extraMargin) {
        container.scrollTo({ top: itemTop - extraMargin, behavior: 'smooth' })
      } else if (itemBottom > containerScrollTop + containerHeight - extraMargin) {
        container.scrollTo({ top: itemBottom - containerHeight + extraMargin, behavior: 'smooth' })
      }
    }
    setKeyboardNav(false)
  }, [selectedIndex, keyboardNav])

  return (
    <div className={`scroll-list-container ${className}`}>
      <div
        ref={listRef}
        className={`scroll-list ${!displayScrollbar ? 'no-scrollbar' : ''}`}
        onScroll={handleScroll}
        {...(keyboardTarget === 'container' ? { tabIndex: 0, onKeyDown: handleKeyDown as (e: ReactKeyboardEvent<HTMLDivElement>) => void } : {})}
      >
        {items.map((item, index) => (
          <AnimatedItem
            key={index}
            delay={0.1}
            index={index}
            onMouseEnter={() => handleItemMouseEnter(index)}
            onClick={() => handleItemClick(item, index)}
          >
            <div className={`item ${selectedIndex === index ? 'selected' : ''} ${itemClassName}`}>
              {renderItem ? renderItem(item, selectedIndex === index) : <p className="item-text">{String(item)}</p>}
            </div>
          </AnimatedItem>
        ))}
        {footer}
      </div>
      {showGradients && (
        <>
          <div className="top-gradient" style={{ opacity: topGradientOpacity }} />
          <div className="bottom-gradient" style={{ opacity: bottomGradientOpacity }} />
        </>
      )}
    </div>
  )
}

export default AnimatedList
