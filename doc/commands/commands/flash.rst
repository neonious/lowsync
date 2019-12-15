###################
Flash
###################

Name
==================

lowsync-flash - Flash low.js to generic ESP32-WROVER microcontroller board

Synopsis
==================

.. code-block:: bash

    lowsync flash --port=<port> [params..]

Description
==================

Flash low.js to generic ESP32-WROVER microcontroller board. For experts, also parameters of esptool are supported (see https://github.com/espressif/esptool for more information).

Options
==================

.. code-block:: bash

    <port>

The serial port which the USB/serial chip of the ESP32 board creates. Under Windows this usually starts with "COM" (find out the correct one with the Device Manager), on other systems with "/dev/tty" (check file system to find the correct one).

.. code-block:: bash

    --init

Resets to factory settings by erasing flash. Use this on first flashing.

.. code-block:: bash

    --reset-network

Resets network settings to Wifi access point and outputs the credentials to connect.
