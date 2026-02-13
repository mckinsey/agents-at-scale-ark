import { render } from '@testing-library/react';
import RootLayout, { metadata } from '../layout';

describe('RootLayout', () => {
  it('renders children correctly', () => {
    const { getByText } = render(
      <RootLayout>
        <div>Test Content</div>
      </RootLayout>
    );

    expect(getByText('Test Content')).toBeInTheDocument();
  });

  it('has correct metadata', () => {
    expect(metadata.title).toBe('ARK Demos');
    expect(metadata.description).toBe('Explore ARK demonstrations');
  });
});
