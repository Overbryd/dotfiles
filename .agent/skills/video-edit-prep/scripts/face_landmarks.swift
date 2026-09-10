import Foundation
import Vision
import ImageIO

struct Detection: Codable {
    let path: String
    let faceConfidence: Float?
    let faceX: Double?
    let faceY: Double?
    let faceWidth: Double?
    let faceHeight: Double?
    let eyeX: Double?
    let eyeY: Double?
}

func average(_ points: [CGPoint]) -> CGPoint? {
    guard !points.isEmpty else { return nil }
    let sum = points.reduce(CGPoint.zero) { result, point in
        CGPoint(x: result.x + point.x, y: result.y + point.y)
    }
    return CGPoint(x: sum.x / CGFloat(points.count), y: sum.y / CGFloat(points.count))
}

func image(for path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let source = CGImageSourceCreateWithURL(url, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]

for path in CommandLine.arguments.dropFirst() {
    guard let cgImage = image(for: path) else {
        let result = Detection(path: path, faceConfidence: nil, faceX: nil, faceY: nil, faceWidth: nil, faceHeight: nil, eyeX: nil, eyeY: nil)
        print(String(data: try encoder.encode(result), encoding: .utf8)!)
        continue
    }

    let request = VNDetectFaceLandmarksRequest()
    try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
    let faces = (request.results ?? []).sorted {
        $0.boundingBox.width * $0.boundingBox.height > $1.boundingBox.width * $1.boundingBox.height
    }

    guard let face = faces.first else {
        let result = Detection(path: path, faceConfidence: nil, faceX: nil, faceY: nil, faceWidth: nil, faceHeight: nil, eyeX: nil, eyeY: nil)
        print(String(data: try encoder.encode(result), encoding: .utf8)!)
        continue
    }

    let eyePoints = [face.landmarks?.leftEye, face.landmarks?.rightEye]
        .compactMap { $0 }
        .compactMap { average($0.normalizedPoints) }
    let eye = average(eyePoints).map {
        CGPoint(
            x: face.boundingBox.origin.x + $0.x * face.boundingBox.width,
            y: face.boundingBox.origin.y + $0.y * face.boundingBox.height
        )
    }

    let result = Detection(
        path: path,
        faceConfidence: face.confidence,
        faceX: face.boundingBox.origin.x,
        faceY: face.boundingBox.origin.y,
        faceWidth: face.boundingBox.width,
        faceHeight: face.boundingBox.height,
        eyeX: eye.map { Double($0.x) },
        eyeY: eye.map { Double($0.y) }
    )
    print(String(data: try encoder.encode(result), encoding: .utf8)!)
}
