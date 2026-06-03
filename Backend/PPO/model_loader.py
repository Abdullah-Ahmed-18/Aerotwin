import zipfile
import io
import torch
import torch.nn as nn
import numpy as np


class PPOPolicy(nn.Module):
    """Minimal PPO MlpPolicy loader for inference only."""

    def __init__(self):
        super().__init__()
        # Architecture inferred from policy.pth weights in ppo_v1_production.zip
        self.pi_net = nn.Sequential(
            nn.Linear(7, 256),
            nn.Tanh(),
            nn.Linear(256, 256),
            nn.Tanh(),
        )
        self.action_net = nn.Linear(256, 130)
        self.log_std = nn.Parameter(torch.zeros(130))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.pi_net(x)
        return self.action_net(features)

    def predict(self, observation, deterministic=True):
        """
        Mimics stable_baselines3 PPO.predict().
        observation: np.ndarray of shape (batch, 7) or (7,)
        Returns: (action, state) where action is np.ndarray
        """
        with torch.no_grad():
            obs = torch.as_tensor(observation, dtype=torch.float32)
            if obs.dim() == 1:
                obs = obs.unsqueeze(0)
            action_mean = self.forward(obs)
            if deterministic:
                action = action_mean.numpy()
            else:
                std = torch.exp(self.log_std)
                action = torch.normal(action_mean, std).numpy()
            return action, None


def load_policy(zip_path: str) -> PPOPolicy:
    policy = PPOPolicy()
    with zipfile.ZipFile(zip_path, "r") as z:
        with z.open("policy.pth") as f:
            buf = io.BytesIO(f.read())
            state_dict = torch.load(buf, map_location="cpu", weights_only=True)

    # Remap SB3 keys to our module names
    remap = {
        "mlp_extractor.policy_net.0.weight": "pi_net.0.weight",
        "mlp_extractor.policy_net.0.bias":   "pi_net.0.bias",
        "mlp_extractor.policy_net.2.weight": "pi_net.2.weight",
        "mlp_extractor.policy_net.2.bias":   "pi_net.2.bias",
        "action_net.weight":                 "action_net.weight",
        "action_net.bias":                   "action_net.bias",
        "log_std":                           "log_std",
    }

    new_state = {}
    for old_k, new_k in remap.items():
        if old_k in state_dict:
            new_state[new_k] = state_dict[old_k]

    missing, unexpected = policy.load_state_dict(new_state, strict=False)
    if missing:
        raise RuntimeError(f"Missing keys when loading policy: {missing}")
    policy.eval()
    return policy
