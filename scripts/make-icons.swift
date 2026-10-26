import AppKit

let taskRoot = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: taskRoot, withIntermediateDirectories: true)
for size in [16, 32, 64, 128, 256, 512, 1024] {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    let scale = CGFloat(size) / 128
    let transform = NSAffineTransform()
    transform.scale(by: scale)
    transform.concat()
    NSColor(white: 0.16, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: 128, height: 128), xRadius: 28, yRadius: 28).fill()
    NSColor(white: 0.60, alpha: 1).setStroke()
    let frame = NSBezierPath(roundedRect: NSRect(x: 24, y: 37, width: 75, height: 57), xRadius: 7, yRadius: 7)
    frame.lineWidth = 5
    frame.stroke()
    NSColor(white: 0.94, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 57, y: 25, width: 51, height: 38), xRadius: 6, yRadius: 6).fill()
    NSColor(white: 0.20, alpha: 1).setFill()
    let play = NSBezierPath()
    play.move(to: NSPoint(x: 77, y: 36))
    play.line(to: NSPoint(x: 77, y: 52))
    play.line(to: NSPoint(x: 90, y: 44))
    play.close()
    play.fill()
    image.unlockFocus()
    // Normalize Retina rendering to an exact pixel size for manifest icons.
    let output = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: output)
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    try output.representation(using: .png, properties: [:])!.write(to: taskRoot.appendingPathComponent("icon-\(size).png"))
}
