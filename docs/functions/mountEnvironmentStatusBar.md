[**@fest-lib/fl-ui v1.0.21**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / mountEnvironmentStatusBar

# Function: mountEnvironmentStatusBar()

```ts
function mountEnvironmentStatusBar(
   shell, 
   introInnerHtml, 
   device
): MountStatusBarResult;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/statusbar/statusbar.ts:447

`ui-statusbar`:
- Desktop footer: intro (left), shell meta (center), device tray (right; often CSS-hidden).
- Overlay (mobile/fullscreen): clock (left), device tray (right); intro/meta hidden.

## Parameters

### shell

[`EnvironmentShellStatusRefs`](../type-aliases/EnvironmentShellStatusRefs.md)

### introInnerHtml

`string`

### device

[`ShellDeviceStatus`](../type-aliases/ShellDeviceStatus.md)

## Returns

[`MountStatusBarResult`](../type-aliases/MountStatusBarResult.md)
