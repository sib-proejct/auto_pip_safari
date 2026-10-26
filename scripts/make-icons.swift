import AppKit

let taskRoot = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: taskRoot, withIntermediateDirectories: true)
for size in [16, 32, 64, 128, 256, 512, 1024] {
  for toolbar in [false, true] {
    if toolbar && size > 128 { continue }
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    let scale = CGFloat(size) / 128
    let transform = NSAffineTransform()
    transform.scale(by: scale)
    transform.concat()
    if !toolbar {
    NSColor(srgbRed: 0.19, green: 0.24, blue: 0.30, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: 128, height: 128), xRadius: 28, yRadius: 28).fill()
    }
    (toolbar ? NSColor.black : NSColor(srgbRed: 0.58, green: 0.66, blue: 0.74, alpha: 1)).setStroke()
    let frame = NSBezierPath(roundedRect: NSRect(x: 24, y: 37, width: 75, height: 57), xRadius: 7, yRadius: 7)
    frame.lineWidth = 5
    frame.stroke()
    let floating = NSBezierPath(roundedRect: NSRect(x: 57, y: 25, width: 51, height: 38), xRadius: 6, yRadius: 6)
    if toolbar {
      // Keep the active tint subtle by using an outline instead of a solid tile.
      NSGraphicsContext.current?.compositingOperation = .clear
      NSBezierPath(rect: NSRect(x: 52, y: 20, width: 61, height: 48)).fill()
      NSGraphicsContext.current?.compositingOperation = .sourceOver
      NSColor.black.setStroke()
      floating.lineWidth = 5
      floating.stroke()
    } else {
      NSColor(srgbRed: 0.84, green: 0.89, blue: 0.94, alpha: 1).setFill()
      floating.fill()
    }
    if !toolbar {
    NSColor(srgbRed: 0.20, green: 0.29, blue: 0.38, alpha: 1).setFill()
    let play = NSBezierPath()
    play.move(to: NSPoint(x: 77, y: 36))
    play.line(to: NSPoint(x: 77, y: 52))
    play.line(to: NSPoint(x: 90, y: 44))
    play.close()
    play.fill()
    }
    image.unlockFocus()
    // Normalize Retina rendering to an exact pixel size for manifest icons.
    let output = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: output)
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    let prefix = toolbar ? "toolbar" : "icon"
    try output.representation(using: .png, properties: [:])!.write(to: taskRoot.appendingPathComponent("\(prefix)-\(size).png"))
  }
}
