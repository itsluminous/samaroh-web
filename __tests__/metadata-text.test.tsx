/**
 * MetadataText — the shared attribution / timestamp / audit line. Must render
 * the theme's `metadata` typography variant: caption size (0.75rem) in a
 * MONOSPACE family with a muted colour, so metadata is visually distinct from
 * content (notes / body text stay body size in text.primary). Cross-platform
 * convention with Android (labelSmall + monospace + onSurfaceVariant).
 */
import { ThemeProvider } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { render, screen } from '@testing-library/react';
import MetadataText, { METADATA_FONT_FAMILY } from '@/components/MetadataText';
import theme from '@/theme/theme';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('MetadataText', () => {
  it('renders caption-sized MONOSPACE text in the muted secondary colour', () => {
    renderWithTheme(<MetadataText>Added by Priya on 12 Sep 2026</MetadataText>);
    const el = screen.getByText('Added by Priya on 12 Sep 2026');
    expect(el).toHaveAttribute('data-metadata');
    expect(el).toHaveClass('MuiTypography-metadata');
    expect(el).toHaveStyle({ fontFamily: METADATA_FONT_FAMILY, fontSize: '0.75rem' });
    expect(METADATA_FONT_FAMILY).toMatch(/monospace/);
    // Muted: the palette's text.secondary token (CSS-variables theme), never text.primary.
    expect(el).toHaveStyle({ color: 'var(--mui-palette-text-secondary)' });
  });

  it('is visually distinct from body content rendered next to it', () => {
    renderWithTheme(
      <>
        <Typography variant="body2" color="text.primary">
          Decor for the mandap, two extra chairs
        </Typography>
        <MetadataText component="div">Added by Priya</MetadataText>
      </>,
    );
    const body = screen.getByText('Decor for the mandap, two extra chairs');
    const meta = screen.getByText('Added by Priya');
    expect(meta.tagName).toBe('DIV');
    expect(body).toHaveStyle({ color: 'var(--mui-palette-text-primary)' });
    expect(body).not.toHaveStyle({ fontFamily: METADATA_FONT_FAMILY });
    expect(meta).toHaveStyle({ fontSize: '0.75rem', fontFamily: METADATA_FONT_FAMILY });
  });

  it('defaults to an inline span so it can sit inside a ListItemText secondary', () => {
    renderWithTheme(<MetadataText>Updated 2 days ago</MetadataText>);
    expect(screen.getByText('Updated 2 days ago').tagName).toBe('SPAN');
  });
});
