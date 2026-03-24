<?php
/**
 * Hostinger-Native Social Sharing (Replaces Supabase Edge Functions)
 * Generates dynamic Open Graph meta tags for viral social sharing
 * UNLIMITED INVOCATIONS - Solves the "Virality Paradox"
 */

$match_id = $_GET['id'] ?? 'default';

// Sanitize input
$match_id = htmlspecialchars($match_id, ENT_QUOTES, 'UTF-8');

// Generate metadata (Can be enhanced to fetch from Supabase via cURL)
$title = "Join Match #$match_id - Backgammon VIVO";
$description = "Play Backgammon with live video! Challenge accepted.";
$image = "https://www.aidoit4u.eu/og-default.png"; // Or dynamic: /api/og/$match_id.png

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Open Graph Tags (WhatsApp, Facebook) -->
    <meta property="og:title" content="<?php echo $title; ?>">
    <meta property="og:description" content="<?php echo $description; ?>">
    <meta property="og:image" content="<?php echo $image; ?>">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://www.aidoit4u.eu/match/<?php echo $match_id; ?>">
    
    <!-- Auto-redirect to React app -->
    <meta http-equiv="refresh" content="0;url=/match/<?php echo $match_id; ?>">
    
    <title><?php echo $title; ?></title>
</head>
<body>
    <p>Redirecting to match...</p>
</body>
</html>
