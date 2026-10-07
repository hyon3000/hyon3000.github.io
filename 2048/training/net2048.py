"""Board-size independent afterstate value network for 2048 (fully convolutional + global mixing)."""
import torch
import torch.nn as nn
import torch.nn.functional as F

NE = 17            # exponent channels: 0 (empty) .. 16 (65536 and above)
NP = 4             # position channels (symmetric under rotation / mirroring)


def pos_channels(H, W, device):
    y = torch.arange(H, device=device).float(); x = torch.arange(W, device=device).float()
    ey = torch.minimum(y, H - 1 - y)[:, None].expand(H, W); ex = torch.minimum(x, W - 1 - x)[None, :].expand(H, W)
    e = torch.minimum(ex, ey); cd = ex + ey
    return torch.stack([torch.exp(-e), torch.exp(-cd * 0.5), (e == 0).float(), torch.ones(H, W, device=device)])


def encode(b):
    """b: (B,H,W) long exponents -> (B, NE+NP, H, W) float"""
    B, H, W = b.shape
    oh = F.one_hot(b.clamp(max=NE - 1), NE).permute(0, 3, 1, 2).float()
    return torch.cat([oh, pos_channels(H, W, b.device)[None].expand(B, NP, H, W)], 1)


class Net(nn.Module):
    def __init__(self, ch=48, layers=5, hid=128):
        super().__init__()
        self.ch, self.layers, self.hid = ch, layers, hid
        self.inp = nn.Conv2d(NE + NP, ch, 3, padding=1)
        self.convs = nn.ModuleList([nn.Conv2d(ch, ch, 3, padding=1) for _ in range(layers)])
        self.glob = nn.ModuleList([nn.Linear(2 * ch, ch) for _ in range(layers)])
        self.h1 = nn.Linear(2 * ch, hid)
        self.h2 = nn.Linear(hid, 1)

    def forward(self, b):
        x = F.relu(self.inp(encode(b)))
        for conv, g in zip(self.convs, self.glob):
            y = conv(x)
            p = torch.cat([y.mean((2, 3)), y.amax((2, 3))], 1)
            x = F.relu(x + y + g(p)[:, :, None, None])
        p = torch.cat([x.mean((2, 3)), x.amax((2, 3))], 1)
        return self.h2(F.relu(self.h1(p)))[:, 0]
