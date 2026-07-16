package com.vertial.iosbridge;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VertialIosBridge")
public class VertialIosBridgePlugin extends Plugin {

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(intent);
    JSObject ret = new JSObject();
    ret.put("opened", true);
    call.resolve(ret);
  }

  @PluginMethod
  public void requestLocalNetworkAccess(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("triggered", true);
    call.resolve(ret);
  }
}
