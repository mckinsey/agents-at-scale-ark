import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStickyScroll } from '@/lib/hooks/use-sticky-scroll';

function Harness() {
  const {
    scrollContainerRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    resumeAutoScroll,
  } = useStickyScroll();

  return (
    <div>
      <div data-testid="container" ref={scrollContainerRef} onScroll={handleScroll}>
        <div data-testid="end" ref={messagesEndRef} />
      </div>
      <button data-testid="scroll" onClick={scrollToBottom}>
        scroll
      </button>
      <button data-testid="resume" onClick={resumeAutoScroll}>
        resume
      </button>
    </div>
  );
}

function setGeometry(
  el: HTMLElement,
  geometry: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperty(el, 'scrollHeight', {
    value: geometry.scrollHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', {
    value: geometry.clientHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', {
    value: geometry.scrollTop,
    configurable: true,
    writable: true,
  });
}

describe('useStickyScroll', () => {
  let scrollSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
  });

  it('follows new content when the user is at the bottom', () => {
    render(<Harness />);
    const container = screen.getByTestId('container');
    setGeometry(container, { scrollHeight: 300, clientHeight: 300, scrollTop: 0 });

    fireEvent.scroll(container);
    scrollSpy.mockClear();
    fireEvent.click(screen.getByTestId('scroll'));

    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('treats being within the threshold as at the bottom', () => {
    render(<Harness />);
    const container = screen.getByTestId('container');
    setGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 300,
      scrollTop: 650,
    });

    fireEvent.scroll(container);
    scrollSpy.mockClear();
    fireEvent.click(screen.getByTestId('scroll'));

    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('does not follow when the user has scrolled up beyond the threshold', () => {
    render(<Harness />);
    const container = screen.getByTestId('container');
    setGeometry(container, { scrollHeight: 1000, clientHeight: 300, scrollTop: 0 });

    fireEvent.scroll(container);
    scrollSpy.mockClear();
    fireEvent.click(screen.getByTestId('scroll'));

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('re-engages auto-follow after resumeAutoScroll', () => {
    render(<Harness />);
    const container = screen.getByTestId('container');
    setGeometry(container, { scrollHeight: 1000, clientHeight: 300, scrollTop: 0 });

    fireEvent.scroll(container);
    fireEvent.click(screen.getByTestId('resume'));
    scrollSpy.mockClear();
    fireEvent.click(screen.getByTestId('scroll'));

    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });
});
