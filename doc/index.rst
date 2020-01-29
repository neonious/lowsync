.. lowsyncdoc documentation master file, created by
   sphinx-quickstart on Thu Aug  9 21:39:03 2018.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

##################
lowsync manual
##################

A tool to program low.js for ESP32 based devices. Allows the user to flash low.js, sync directories to the device, change settings, start/stop programs, install/uninstall npm modules and build custom firmware.

Getting started
==================

First, install lowsync, by calling the following as Administrator/root:

.. code-block:: bash

    npm install --unsafe-perm -g lowsync

The option `--unsafe-perm` lets the install script run as root instead of letting npm change the user to nobody before running the install script. This is required for the serialport module.

Alternativly, install as normal user into your local node_modules directory:

.. code-block:: bash

	npm install lowsync

You then have to always call lowsync with path however:

.. code-block:: bash

	node_modules/.bin/lowsync [your parameters...]

After installing lowsync, run

.. code-block:: bash

    lowsync init

The program will ask you some questions and the configuration file *lowsync.config.json* will be created in the current working directory.

You may be able to configure your configuration further by reading the section about :doc:`configuration </configuration>` and editing your configuration manually.

After configuring the program, you may now run one of the many other :doc:`commands </commands/index>`.

For most commands the program will need to authenticate with the device. It will automatically guide you through the process, but here is a quick explaination on what exactly happens. Before executing a command, the password will be read from *lowsync.auth.config.json* in the current working directory or a parent directory. If the file is found, authentication is attempted. If the file cannot be found or the password is incorrect, the user will be asked for the password. Authentication is attempted again and if the password is correct and the user gives permission, the password is saved to the file.

.. toctree::
   commands/index
   configuration
   :hidden:
   :includehidden:
   :titlesonly:
   :maxdepth: 4

..
    Indices and tables
    ==================

    * :ref:`genindex`
    * :ref:`modindex`
    * :ref:`search`
