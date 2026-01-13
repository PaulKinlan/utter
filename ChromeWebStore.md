# Chrome Web Store Listing Requirements

This document describes all attributes needed for Chrome Web Store upload.

## Required Assets

### Icons
- `icon-16.png` - 16x16px (toolbar)
- `icon-32.png` - 32x32px (Windows)
- `icon-48.png` - 48x48px (extensions management page)
- `icon-128.png` - 128x128px (Chrome Web Store, installation)

### Promotional Images
- **Small promo tile**: 440x280px (required for featuring)
- **Marquee promo tile**: 1400x560px (optional, for featured placement)

### Screenshots
- Minimum: 1 screenshot
- Maximum: 5 screenshots
- Size: 1280x800px or 640x400px
- Format: PNG or JPEG

## Store Listing Fields

### Required
| Field | Max Length | Description |
|-------|------------|-------------|
| Name | 45 chars | Extension name |
| Summary | 132 chars | Brief description shown in search results |
| Description | 16,000 chars | Full description with features and usage |
| Category | - | Select from Chrome Web Store categories |
| Language | - | Primary language of the extension |

### Optional but Recommended
| Field | Description |
|-------|-------------|
| Website | Official extension website |
| Support URL | Where users can get help |
| Privacy Policy URL | Required if extension handles user data |

## Privacy Requirements

### Privacy Practices Disclosure
You must disclose:
- What data is collected
- How data is used
- Whether data is sold to third parties
- Whether data is used for purposes unrelated to the extension's functionality

### Single Purpose Policy
The extension must have a single, clearly stated purpose. All functionality must relate to this purpose.

## Manifest Fields for Store

Ensure `manifest.json` includes:
```json
{
  "name": "Extension Name",
  "version": "1.0.0",
  "description": "Brief description (132 chars max)",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

## Review Checklist

Before submitting:
- [ ] All required icons present and correct sizes
- [ ] At least one screenshot (1280x800 or 640x400)
- [ ] Description clearly explains functionality
- [ ] Privacy policy URL provided (if handling user data)
- [ ] All permissions justified in description
- [ ] Extension tested on latest Chrome stable
- [ ] No references to "beta" or "test" in public listing
